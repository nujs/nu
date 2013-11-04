// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

#ifndef SRC_ASYNC_WRAP_INL_H_
#define SRC_ASYNC_WRAP_INL_H_

#include "async-wrap.h"
#include "env.h"
#include "env-inl.h"
#include "util.h"
#include "util-inl.h"
#include "v8.h"
#include <assert.h>

namespace node {

inline AsyncWrap::AsyncWrap(Environment* env, v8::Handle<v8::Object> object)
    : object_(env->isolate(), object),
      env_(env),
      async_flags_(NO_OPTIONS) {
  assert(!object.IsEmpty());

  if (!env->has_async_listeners())
    return;

  // TODO(trevnorris): Do we really need to TryCatch this call?
  v8::TryCatch try_catch;
  try_catch.SetVerbose(true);

  v8::Local<v8::Value> val = object.As<v8::Value>();
  env->async_listener_run_function()->Call(env->process_object(), 1, &val);

  if (!try_catch.HasCaught())
    async_flags_ |= ASYNC_LISTENERS;
}


inline AsyncWrap::~AsyncWrap() {
  assert(persistent().IsEmpty());
}


template<typename TYPE>
inline void AsyncWrap::AddMethods(v8::Handle<v8::FunctionTemplate> t) {
  NODE_SET_PROTOTYPE_METHOD(t,
                            "addAsyncListener",
                            AddAsyncListener<TYPE>);
  NODE_SET_PROTOTYPE_METHOD(t,
                            "removeAsyncListener",
                            RemoveAsyncListener<TYPE>);
}


inline uint32_t AsyncWrap::async_flags() const {
  return async_flags_;
}


inline void AsyncWrap::set_flag(unsigned int flag) {
  async_flags_ |= flag;
}


inline void AsyncWrap::remove_flag(unsigned int flag) {
  async_flags_ &= ~flag;
}


inline bool AsyncWrap::has_async_queue() {
  return async_flags() & ASYNC_LISTENERS;
}


inline Environment* AsyncWrap::env() const {
  return env_;
}


inline v8::Local<v8::Object> AsyncWrap::object() {
  return PersistentToLocal(env()->isolate(), persistent());
}


inline v8::Persistent<v8::Object>& AsyncWrap::persistent() {
  return object_;
}


template <bool final>
inline v8::Handle<v8::Value> AsyncWrap::MakeCallback(
    const v8::Handle<v8::Function> cb,
    int argc,
    v8::Handle<v8::Value>* argv) {
  assert(env()->context() == env()->isolate()->GetCurrentContext());

  v8::Local<v8::Object> context = object();
  v8::Local<v8::Object> process = env()->process_object();
  v8::Local<v8::Value> async_queue_argv[2];

  if (has_async_queue()) {
    async_queue_argv[0] = context.As<v8::Value>();
    async_queue_argv[1] = v8::Boolean::New(final);
  }

  v8::TryCatch try_catch;
  try_catch.SetVerbose(true);

  if (has_async_queue()) {
    env()->async_listener_load_function()->Call(process, 2, async_queue_argv);

    if (try_catch.HasCaught())
      return v8::Undefined(env()->isolate());
  }

  v8::Local<v8::Value> ret = cb->Call(context, argc, argv);

  if (try_catch.HasCaught()) {
    return Undefined(env()->isolate());
  }

  if (has_async_queue()) {
    v8::Local<v8::Value> val = context.As<v8::Value>();
    env()->async_listener_unload_function()->Call(process, 2, async_queue_argv);
  }

  Environment::TickInfo* tick_info = env()->tick_info();

  if (tick_info->in_tick()) {
    return ret;
  }

  if (tick_info->length() == 0) {
    tick_info->set_index(0);
    return ret;
  }

  tick_info->set_in_tick(true);

  // TODO(trevnorris): Consider passing "context" to _tickCallback so it
  // can then be passed as the first argument to the nextTick callback.
  // That should greatly help needing to create closures.
  env()->tick_callback_function()->Call(process, 0, NULL);

  tick_info->set_in_tick(false);

  if (try_catch.HasCaught()) {
    tick_info->set_last_threw(true);
    return Undefined(env()->isolate());
  }

  return ret;
}


template <bool final>
inline v8::Handle<v8::Value> AsyncWrap::MakeCallback(
    const v8::Handle<v8::String> symbol,
    int argc,
    v8::Handle<v8::Value>* argv) {
  v8::Local<v8::Value> cb_v = object()->Get(symbol);
  v8::Local<v8::Function> cb = cb_v.As<v8::Function>();
  assert(cb->IsFunction());

  return MakeCallback<final>(cb, argc, argv);
}


template <bool final>
inline v8::Handle<v8::Value> AsyncWrap::MakeCallback(
    uint32_t index,
    int argc,
    v8::Handle<v8::Value>* argv) {
  v8::Local<v8::Value> cb_v = object()->Get(index);
  v8::Local<v8::Function> cb = cb_v.As<v8::Function>();
  assert(cb->IsFunction());

  return MakeCallback<final>(cb, argc, argv);
}


template <typename TYPE>
inline void AsyncWrap::AddAsyncListener(
    const v8::FunctionCallbackInfo<v8::Value>& args) {
  Environment* env = Environment::GetCurrent(args.GetIsolate());
  v8::HandleScope handle_scope(args.GetIsolate());

  v8::Local<v8::Object> handle = args.This();
  v8::Local<v8::Value> listener = args[0];
  assert(listener->IsObject());
  assert(handle->InternalFieldCount() > 0);

  env->async_listener_push_function()->Call(handle, 1, &listener);

  TYPE* wrap = static_cast<TYPE*>(
      handle->GetAlignedPointerFromInternalField(0));
  assert(wrap != NULL);
  wrap->set_flag(ASYNC_LISTENERS);
}


template <typename TYPE>
inline void AsyncWrap::RemoveAsyncListener(
    const v8::FunctionCallbackInfo<v8::Value>& args) {
  Environment* env = Environment::GetCurrent(args.GetIsolate());
  v8::HandleScope handle_scope(args.GetIsolate());

  v8::Local<v8::Object> handle = args.This();
  v8::Local<v8::Value> listener = args[0];
  assert(listener->IsObject());
  assert(handle->InternalFieldCount() > 0);

  v8::Local<v8::Value> ret =
      env->async_listener_strip_function()->Call(handle, 1, &listener);

  if (ret->IsFalse()) {
    TYPE* wrap = static_cast<TYPE*>(
        handle->GetAlignedPointerFromInternalField(0));
    assert(wrap != NULL);
    wrap->remove_flag(ASYNC_LISTENERS);
  }
}

template <typename TypeName>
TypeName* AsyncWrap::Unwrap(v8::Local<v8::Object> object) {
  // Cast to AsyncWrap* before casting to TypeName* avoids issues with classes
  // that have multiple base classes.
  void* p = object->GetAlignedPointerFromInternalField(kInternalFieldIndex);
  AsyncWrap* w = static_cast<AsyncWrap*>(p);
  return static_cast<TypeName*>(w);
}

}  // namespace node

#endif  // SRC_ASYNC_WRAP_INL_H_