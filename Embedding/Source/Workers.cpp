#include "Workers.h"

#include <Babylon/AppRuntime.h>
#include <Babylon/JsRuntime.h>
#include <Babylon/ScriptLoader.h>

#include <Babylon/Polyfills/Blob.h>
#include <Babylon/Polyfills/Console.h>
#include <Babylon/Polyfills/Fetch.h>
#include <Babylon/Polyfills/File.h>
#include <Babylon/Polyfills/Performance.h>
#include <Babylon/Polyfills/TextDecoder.h>
#include <Babylon/Polyfills/TextEncoder.h>
#include <Babylon/Polyfills/XMLHttpRequest.h>

#if BABYLON_NATIVE_POLYFILL_ABORTCONTROLLER
#include <Babylon/Polyfills/AbortController.h>
#endif
#if BABYLON_NATIVE_POLYFILL_URL
#include <Babylon/Polyfills/URL.h>
#endif
#if BABYLON_NATIVE_POLYFILL_WINDOW
#include <Babylon/Polyfills/Window.h>
#endif

#include <UrlLib/UrlLib.h>
#include <arcana/threading/task.h>
#include <napi/napi.h>

#include <future>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace
{
    // ------------------------------------------------------------------
    // Structured-clone subset: deep copy of JS values between independent runtimes.
    // Supports primitives, plain objects, arrays, ArrayBuffer and TypedArrays
    // (copied by value). Functions and exotic objects throw, mirroring the
    // web's DataCloneError.
    // ------------------------------------------------------------------
    struct CloneValue
    {
        enum class Type
        {
            Undefined,
            Null,
            Boolean,
            Number,
            String,
            Array,
            Object,
            ArrayBuffer,
            TypedArray,
        };

        Type ValueType{Type::Undefined};
        bool BooleanValue{};
        double NumberValue{};
        std::string StringValue{};
        std::vector<CloneValue> ArrayItems{};
        std::vector<std::pair<std::string, CloneValue>> ObjectProperties{};
        std::vector<uint8_t> Bytes{};
        napi_typedarray_type TypedArrayType{napi_uint8_array};
    };

    CloneValue FromNapi(const Napi::Value& value, int depth = 0)
    {
        if (depth > 64)
        {
            throw Napi::Error::New(value.Env(), "Worker postMessage: structure too deep (cycle?)");
        }

        CloneValue result{};
        if (value.IsUndefined())
        {
            result.ValueType = CloneValue::Type::Undefined;
        }
        else if (value.IsNull())
        {
            result.ValueType = CloneValue::Type::Null;
        }
        else if (value.IsBoolean())
        {
            result.ValueType = CloneValue::Type::Boolean;
            result.BooleanValue = value.As<Napi::Boolean>().Value();
        }
        else if (value.IsNumber())
        {
            result.ValueType = CloneValue::Type::Number;
            result.NumberValue = value.As<Napi::Number>().DoubleValue();
        }
        else if (value.IsString())
        {
            result.ValueType = CloneValue::Type::String;
            result.StringValue = value.As<Napi::String>().Utf8Value();
        }
        else if (value.IsTypedArray())
        {
            const auto typedArray = value.As<Napi::TypedArray>();
            result.ValueType = CloneValue::Type::TypedArray;
            result.TypedArrayType = typedArray.TypedArrayType();
            const auto buffer = typedArray.ArrayBuffer();
            const auto* data = static_cast<const uint8_t*>(buffer.Data()) + typedArray.ByteOffset();
            result.Bytes.assign(data, data + typedArray.ByteLength());
        }
        else if (value.IsArrayBuffer())
        {
            const auto arrayBuffer = value.As<Napi::ArrayBuffer>();
            result.ValueType = CloneValue::Type::ArrayBuffer;
            const auto* data = static_cast<const uint8_t*>(arrayBuffer.Data());
            result.Bytes.assign(data, data + arrayBuffer.ByteLength());
        }
        else if (value.IsArray())
        {
            const auto array = value.As<Napi::Array>();
            result.ValueType = CloneValue::Type::Array;
            const uint32_t length = array.Length();
            result.ArrayItems.reserve(length);
            for (uint32_t i = 0; i < length; i++)
            {
                result.ArrayItems.push_back(FromNapi(array.Get(i), depth + 1));
            }
        }
        else if (value.IsFunction())
        {
            throw Napi::Error::New(value.Env(), "Worker postMessage: functions cannot be cloned");
        }
        else if (value.IsObject())
        {
            const auto env = value.Env();
            const auto object = value.As<Napi::Object>();
            result.ValueType = CloneValue::Type::Object;
            // Object.keys via JS: Napi::Object::GetPropertyNames is not
            // implemented on all JsRuntimeHost engine bridges (returns
            // undefined on JavaScriptCore).
            const auto keys = env.Global()
                                  .Get("Object").As<Napi::Object>()
                                  .Get("keys").As<Napi::Function>()
                                  .Call({object}).As<Napi::Array>();
            const uint32_t length = keys.Length();
            result.ObjectProperties.reserve(length);
            for (uint32_t i = 0; i < length; i++)
            {
                const auto key = keys.Get(i).As<Napi::String>().Utf8Value();
                result.ObjectProperties.emplace_back(key, FromNapi(object.Get(key), depth + 1));
            }
        }
        else
        {
            throw Napi::Error::New(value.Env(), "Worker postMessage: value cannot be cloned");
        }
        return result;
    }

    Napi::Value ToNapi(Napi::Env env, const CloneValue& value)
    {
        switch (value.ValueType)
        {
            case CloneValue::Type::Undefined:
                return env.Undefined();
            case CloneValue::Type::Null:
                return env.Null();
            case CloneValue::Type::Boolean:
                return Napi::Boolean::New(env, value.BooleanValue);
            case CloneValue::Type::Number:
                return Napi::Number::New(env, value.NumberValue);
            case CloneValue::Type::String:
                return Napi::String::New(env, value.StringValue);
            case CloneValue::Type::ArrayBuffer:
            {
                auto buffer = Napi::ArrayBuffer::New(env, value.Bytes.size());
                std::memcpy(buffer.Data(), value.Bytes.data(), value.Bytes.size());
                return buffer;
            }
            case CloneValue::Type::TypedArray:
            {
                auto buffer = Napi::ArrayBuffer::New(env, value.Bytes.size());
                std::memcpy(buffer.Data(), value.Bytes.data(), value.Bytes.size());
                switch (value.TypedArrayType)
                {
                    case napi_int8_array:
                        return Napi::TypedArrayOf<int8_t>::New(env, value.Bytes.size(), buffer, 0, napi_int8_array);
                    case napi_uint8_clamped_array:
                        return Napi::TypedArrayOf<uint8_t>::New(env, value.Bytes.size(), buffer, 0, napi_uint8_clamped_array);
                    case napi_int16_array:
                        return Napi::TypedArrayOf<int16_t>::New(env, value.Bytes.size() / 2, buffer, 0, napi_int16_array);
                    case napi_uint16_array:
                        return Napi::TypedArrayOf<uint16_t>::New(env, value.Bytes.size() / 2, buffer, 0, napi_uint16_array);
                    case napi_int32_array:
                        return Napi::TypedArrayOf<int32_t>::New(env, value.Bytes.size() / 4, buffer, 0, napi_int32_array);
                    case napi_uint32_array:
                        return Napi::TypedArrayOf<uint32_t>::New(env, value.Bytes.size() / 4, buffer, 0, napi_uint32_array);
                    case napi_float32_array:
                        return Napi::TypedArrayOf<float>::New(env, value.Bytes.size() / 4, buffer, 0, napi_float32_array);
                    case napi_float64_array:
                        return Napi::TypedArrayOf<double>::New(env, value.Bytes.size() / 8, buffer, 0, napi_float64_array);
                    case napi_uint8_array:
                    default:
                        return Napi::TypedArrayOf<uint8_t>::New(env, value.Bytes.size(), buffer, 0, napi_uint8_array);
                }
            }
            case CloneValue::Type::Array:
            {
                auto array = Napi::Array::New(env, value.ArrayItems.size());
                for (uint32_t i = 0; i < value.ArrayItems.size(); i++)
                {
                    array.Set(i, ToNapi(env, value.ArrayItems[i]));
                }
                return array;
            }
            case CloneValue::Type::Object:
            {
                auto object = Napi::Object::New(env);
                for (const auto& [key, propertyValue] : value.ObjectProperties)
                {
                    object.Set(key, ToNapi(env, propertyValue));
                }
                return object;
            }
        }
        return env.Undefined();
    }

    // ------------------------------------------------------------------
    // Blocking URL fetch for importScripts (worker semantics are synchronous).
    // Safe to block the worker JS thread: UrlLib performs the request on its
    // own machinery and completes via inline_scheduler on the completing thread.
    // ------------------------------------------------------------------
    std::string LoadTextSync(const std::string& url)
    {
        UrlLib::UrlRequest request{};
        request.Open(UrlLib::UrlMethod::Get, url);
        request.ResponseType(UrlLib::UrlResponseType::String);

        std::promise<void> done{};
        std::exception_ptr error{};
        request.SendAsync().then(arcana::inline_scheduler, arcana::cancellation::none(),
            [&done, &error](const arcana::expected<void, std::exception_ptr>& result) {
                if (result.has_error())
                {
                    error = result.error();
                }
                done.set_value();
            });
        done.get_future().wait();

        if (error)
        {
            std::rethrow_exception(error);
        }
        return std::string{request.ResponseString()};
    }

    // Resolve a (possibly relative) importScripts URL against the worker
    // script's URL: absolute URLs pass through; everything else is joined to
    // the base's directory.
    std::string ResolveUrl(const std::string& base, const std::string& url)
    {
        if (url.find("://") != std::string::npos)
        {
            return url;
        }
        std::string relative = url;
        while (relative.rfind("./", 0) == 0)
        {
            relative = relative.substr(2);
        }
        const auto lastSlash = base.rfind('/');
        if (lastSlash == std::string::npos)
        {
            return relative;
        }
        return base.substr(0, lastSlash + 1) + relative;
    }

    // ------------------------------------------------------------------
    // Worker bootstrap, evaluated in the worker runtime before the worker
    // script. Provides the WorkerGlobalScope surface plus JSC compatibility
    // shims (see inline comments).
    // ------------------------------------------------------------------
    constexpr const char* WORKER_BOOTSTRAP = R"===(
(function () {
    var g = globalThis;
    g.self = g;

    // ---- message plumbing ----
    var listeners = [];
    var pending = [];
    var handler = undefined;

    function dispatch(ev) {
        // A throwing handler must not break delivery of other/queued messages
        // (web workers surface handler exceptions via the error event instead).
        if (typeof handler === "function") {
            try { handler(ev); } catch (e) { console.error("worker onmessage threw: " + ((e && e.message) || e)); }
        }
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](ev); } catch (e) { console.error("worker message listener threw: " + ((e && e.message) || e)); }
        }
    }
    function flush() {
        while (pending.length > 0 && (typeof handler === "function" || listeners.length > 0)) {
            dispatch(pending.shift());
        }
    }

    Object.defineProperty(g, "onmessage", {
        get: function () { return handler; },
        set: function (fn) { handler = fn; flush(); },
        configurable: true,
    });
    g.addEventListener = function (type, fn) {
        if (type === "message" && typeof fn === "function") { listeners.push(fn); flush(); }
    };
    g.removeEventListener = function (type, fn) {
        var i = listeners.indexOf(fn);
        if (i >= 0) { listeners.splice(i, 1); }
    };

    // Called from native with the cloned message data.
    g.__ejDispatchMessage = function (data) {
        var ev = { type: "message", data: data };
        if (typeof handler !== "function" && listeners.length === 0) {
            pending.push(ev); // queue until a handler is registered
            return;
        }
        dispatch(ev);
    };

    g.postMessage = function (data) { g.__ejPostToMain(data); };
    g.importScripts = function () {
        for (var i = 0; i < arguments.length; i++) { g.__ejImportScript(String(arguments[i])); }
    };

    // ---- JSC compatibility shims ----
    // Async WebAssembly.instantiate never settles in this embedding; back it
    // with the (working) synchronous Module/Instance path. instantiateStreaming
    // is removed so emscripten glue falls through to the ArrayBuffer path.
    if (typeof WebAssembly !== "undefined") {
        var WA = WebAssembly;
        WA.instantiate = function (source, imports) {
            return new Promise(function (resolve, reject) {
                try {
                    if (source instanceof WA.Module) {
                        resolve(new WA.Instance(source, imports));
                    } else {
                        var mod = new WA.Module(source);
                        resolve({ module: mod, instance: new WA.Instance(mod, imports) });
                    }
                } catch (e) { reject(e); }
            });
        };
        try { WA.instantiateStreaming = undefined; } catch (e) { /* ignore */ }
    }

    // The native TextDecoder polyfill is UTF-8 only; emscripten glue constructs
    // a utf-16le decoder at eval time.
    (function () {
        var NativeTextDecoder = g.TextDecoder;
        function Utf16LEDecoder() { }
        Utf16LEDecoder.prototype.decode = function (input) {
            var u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
            if (u8.byteOffset & 1) { u8 = new Uint8Array(u8); }
            var u16 = new Uint16Array(u8.buffer, u8.byteOffset, u8.byteLength >> 1);
            var parts = [];
            for (var i = 0; i < u16.length; i += 0x8000) {
                parts.push(String.fromCharCode.apply(null, u16.subarray(i, i + 0x8000)));
            }
            return parts.join("");
        };
        g.TextDecoder = function (encoding) {
            if (encoding && /utf-?16/i.test(String(encoding))) { return new Utf16LEDecoder(); }
            return new NativeTextDecoder();
        };
    })();

    console.log("worker bootstrap ready (" + (g.location && g.location.href) + ")");
})();
)===";

    // ------------------------------------------------------------------
    // Worker
    // ------------------------------------------------------------------
    class Worker final : public Napi::ObjectWrap<Worker>
    {
        static constexpr auto JS_CLASS_NAME = "Worker";

        // Cross-thread coordination. The worker thread posts to the main
        // runtime only while MainAlive; the main side stops delivering events
        // once WorkerAlive is cleared (terminate()).
        struct SharedState
        {
            std::mutex Mutex{};
            bool MainAlive{true};
            bool WorkerAlive{true};
            Babylon::JsRuntime* MainRuntime{};
            Worker* WorkerObject{};
        };

    public:
        static inline Babylon::Embedding::Workers::LogCallbackT s_logCallback{};

        static void Initialize(Napi::Env env)
        {
            Napi::HandleScope scope{env};

            Napi::Function func = DefineClass(
                env,
                JS_CLASS_NAME,
                {
                    InstanceMethod("postMessage", &Worker::PostMessage),
                    InstanceMethod("terminate", &Worker::Terminate),
                    InstanceMethod("addEventListener", &Worker::AddEventListener),
                    InstanceMethod("removeEventListener", &Worker::RemoveEventListener),
                    InstanceAccessor("onmessage", &Worker::GetOnMessage, &Worker::SetOnMessage),
                });

            env.Global().Set(JS_CLASS_NAME, func);
        }

        Worker(const Napi::CallbackInfo& info)
            : Napi::ObjectWrap<Worker>{info}
            , m_state{std::make_shared<SharedState>()}
        {
            if (info.Length() < 1 || !info[0].IsString())
            {
                throw Napi::Error::New(info.Env(), "Worker: script URL required");
            }
            m_url = info[0].As<Napi::String>().Utf8Value();

            m_state->MainRuntime = &Babylon::JsRuntime::GetFromJavaScript(info.Env());
            m_state->WorkerObject = this;

            // Keep the JS wrapper (and thus this object and the worker runtime)
            // alive until terminate() — matching web semantics, where a running
            // worker isn't collected just because the creator dropped its ref.
            m_selfRef = Napi::Persistent(info.This().As<Napi::Object>());

            // Route uncaught worker exceptions to the host log — the default
            // handler prints to stdout, which is invisible on iOS.
            Babylon::AppRuntime::Options options{};
            options.UnhandledExceptionHandler = [](const Napi::Error& error) {
                if (s_logCallback)
                {
                    std::string message{"uncaught exception: "};
                    message += error.Message();
                    s_logCallback(message.c_str(), 2);
                }
            };
            m_runtime = std::make_unique<Babylon::AppRuntime>(std::move(options));

            // Initialize the worker environment: non-graphics polyfills + the
            // native hooks the bootstrap wires up (postMessage, importScripts).
            m_runtime->Dispatch([state = m_state, url = m_url](Napi::Env env) {
                env.Global().Set("globalThis", env.Global());

                Babylon::Polyfills::Blob::Initialize(env);
                Babylon::Polyfills::File::Initialize(env);
                Babylon::Polyfills::Console::Initialize(env, [](const char* message, Babylon::Polyfills::Console::LogLevel level) {
                    if (s_logCallback)
                    {
                        s_logCallback(message, static_cast<int>(level));
                    }
                });
                Babylon::Polyfills::Performance::Initialize(env);
                Babylon::Polyfills::TextDecoder::Initialize(env);
                Babylon::Polyfills::TextEncoder::Initialize(env);
                Babylon::Polyfills::XMLHttpRequest::Initialize(env);
                Babylon::Polyfills::Fetch::Initialize(env);
#if BABYLON_NATIVE_POLYFILL_ABORTCONTROLLER
                Babylon::Polyfills::AbortController::Initialize(env);
#endif
#if BABYLON_NATIVE_POLYFILL_URL
                Babylon::Polyfills::URL::Initialize(env);
#endif
#if BABYLON_NATIVE_POLYFILL_WINDOW
                // setTimeout/setInterval/atob (emscripten glue and worker
                // scripts rely on timers).
                Babylon::Polyfills::Window::Initialize(env);
#endif

                // worker -> main
                env.Global().Set("__ejPostToMain", Napi::Function::New(env, [state](const Napi::CallbackInfo& info) {
                    CloneValue clone = FromNapi(info.Length() > 0 ? info[0] : info.Env().Undefined().As<Napi::Value>());
                    std::lock_guard<std::mutex> lock{state->Mutex};
                    if (!state->MainAlive || !state->WorkerAlive)
                    {
                        return;
                    }
                    state->MainRuntime->Dispatch([state, clone = std::move(clone)](Napi::Env env) {
                        Worker* worker{};
                        {
                            std::lock_guard<std::mutex> lock{state->Mutex};
                            if (!state->MainAlive || !state->WorkerAlive)
                            {
                                return;
                            }
                            worker = state->WorkerObject;
                        }
                        worker->EmitMessage(env, clone);
                    });
                }));

                // synchronous importScripts
                env.Global().Set("__ejImportScript", Napi::Function::New(env, [url](const Napi::CallbackInfo& info) {
                    const auto scriptUrl = ResolveUrl(url, info[0].As<Napi::String>().Utf8Value());
                    const auto source = LoadTextSync(scriptUrl);
                    Napi::Eval(info.Env(), source.data(), scriptUrl.data());
                }));

                // worker location (emscripten derives scriptDirectory from it)
                auto location = Napi::Object::New(env);
                location.Set("href", Napi::String::New(env, url));
                env.Global().Set("location", location);
            });

            m_scriptLoader = std::make_unique<Babylon::ScriptLoader>(*m_runtime);
            m_scriptLoader->Eval(WORKER_BOOTSTRAP, "app:///worker-bootstrap.js");
            m_scriptLoader->LoadScript(m_url);
        }

        ~Worker()
        {
            Shutdown();
        }

    private:
        void PostMessage(const Napi::CallbackInfo& info)
        {
            if (!m_runtime)
            {
                return; // terminated
            }
            CloneValue clone = FromNapi(info.Length() > 0 ? info[0] : info.Env().Undefined().As<Napi::Value>());
            m_runtime->Dispatch([clone = std::move(clone)](Napi::Env env) {
                auto dispatchMessage = env.Global().Get("__ejDispatchMessage");
                if (dispatchMessage.IsFunction())
                {
                    dispatchMessage.As<Napi::Function>().Call({ToNapi(env, clone)});
                }
            });
        }

        void Terminate(const Napi::CallbackInfo&)
        {
            Shutdown();
        }

        void Shutdown()
        {
            {
                std::lock_guard<std::mutex> lock{m_state->Mutex};
                if (!m_state->WorkerAlive)
                {
                    return;
                }
                m_state->WorkerAlive = false;
                m_state->MainAlive = false;
            }
            m_scriptLoader.reset();
            m_runtime.reset(); // joins the worker thread
            m_onMessage.Reset();
            m_listeners.clear();
            if (!m_selfRef.IsEmpty())
            {
                m_selfRef.Reset();
            }
        }

        void EmitMessage(Napi::Env env, const CloneValue& clone)
        {
            Napi::HandleScope scope{env};
            auto event = Napi::Object::New(env);
            event.Set("type", Napi::String::New(env, "message"));
            event.Set("data", ToNapi(env, clone));

            if (!m_onMessage.IsEmpty())
            {
                m_onMessage.Call({event});
            }
            for (auto& listener : m_listeners)
            {
                listener.Call({event});
            }
        }

        Napi::Value GetOnMessage(const Napi::CallbackInfo& info)
        {
            return m_onMessage.IsEmpty() ? info.Env().Null() : m_onMessage.Value();
        }

        void SetOnMessage(const Napi::CallbackInfo&, const Napi::Value& value)
        {
            if (value.IsFunction())
            {
                m_onMessage = Napi::Persistent(value.As<Napi::Function>());
            }
            else
            {
                m_onMessage.Reset();
            }
        }

        void AddEventListener(const Napi::CallbackInfo& info)
        {
            if (info[0].As<Napi::String>().Utf8Value() == "message" && info[1].IsFunction())
            {
                m_listeners.push_back(Napi::Persistent(info[1].As<Napi::Function>()));
            }
        }

        void RemoveEventListener(const Napi::CallbackInfo& info)
        {
            if (!info[1].IsFunction())
            {
                return;
            }
            const auto function = info[1].As<Napi::Function>();
            for (auto it = m_listeners.begin(); it != m_listeners.end(); ++it)
            {
                if (it->Value() == function)
                {
                    m_listeners.erase(it);
                    return;
                }
            }
        }

        std::string m_url{};
        std::shared_ptr<SharedState> m_state{};
        std::unique_ptr<Babylon::AppRuntime> m_runtime{};
        std::unique_ptr<Babylon::ScriptLoader> m_scriptLoader{};
        Napi::ObjectReference m_selfRef{};
        Napi::FunctionReference m_onMessage{};
        std::vector<Napi::FunctionReference> m_listeners{};
    };
}

namespace Babylon::Embedding::Workers
{
    void Initialize(Napi::Env env, LogCallbackT logCallback)
    {
        Worker::s_logCallback = std::move(logCallback);
        Worker::Initialize(env);
    }
}
