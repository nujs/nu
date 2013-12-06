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
/*
var domain;
var util = require('util');

function EventEmitter() {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    domain = domain || require('domain');
    if (domain.active && !(this instanceof domain.Domain)) {
      this.domain = domain.active;
    }
  }
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners ares
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;


// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!util.isNumber(n) || n < 0)
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error' && !this._events.error) {
    er = arguments[1];
    if (this.domain) {
      if (!er)
        er = new TypeError('Uncaught, unspecified "error" event.');
      er.domainEmitter = this;
      er.domain = this.domain;
      er.domainThrown = false;
      this.domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      throw TypeError('Uncaught, unspecified "error" event.');
    }
    return false;
  }

  handler = this._events[type];

  if (util.isUndefined(handler))
    return false;

  if (util.isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (util.isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!util.isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              util.isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (util.isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (util.isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!util.isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      console.trace();
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!util.isFunction(listener))
    throw TypeError('listener must be a function');

  function g() {
    this.removeListener(type, g);
    listener.apply(this, arguments);
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!util.isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (util.isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (util.isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (util.isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (util.isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (util.isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};
*/

var assert = require('assert');
var domain = require('domain');
var util = require('util');


var print = function() {
  var s = util.format.apply(null, arguments);
  process._rawDebug(s);
}


function EventEmitter() {
  if (this.uid)
    return;
  this.domain = domain.current;
  this._done = false;
  this._listeningDomains = {};
  this._events = {};
  this.uid = domain.uid();
  this.name = this.constructor.name;
  this.domain.addFinalizer(this);
}

EventEmitter.prototype._checkDone = function() {
  if (this._done)
    throw new Error("This EventEmitter is done");
}

EventEmitter.prototype._attachDomain = function EventEmitter$_attachDomain(domain) {
  print('EE %d: Attaching domain %s', this.uid, domain.uid);
  domain.addRef(this);
  domain.addFinalizer(this);
}

EventEmitter.prototype._detachDomain = function EventEmitter$_detachDomain(domain) {
  print('Detaching domain %s', domain.uid);
  domain.delRef(this);
  domain.removeFinalizer(this);
}

EventEmitter.prototype._addListenerInternal = function(event, listener, once) {
  if (!util.isFunction(listener))
    throw TypeError('listener must be a function');

  this._checkDone();

  var listeningDomains = this._listeningDomains,
      events = this._events;

  if (!listeningDomains[domain.current.uid]) {
    listeningDomains[domain.current.uid] = { count: 1, domain: domain.current };
    // Don't attach to the parent.
    if (domain.current !== this.domain)
      this._attachDomain(domain.current);
  } else
    listeningDomains[domain.current.uid].count++;

  if (!events[event])
    events[event] = [];

  events[event].push({ domain: domain.current, listener: listener, once: once});
}

EventEmitter.prototype.on = function(event, listener) {
  return this._addListenerInternal(event, listener, false);
}

EventEmitter.prototype.addListener = function(event, listener) {
  return this._addListenerInternal(event, listener, false);
}

EventEmitter.prototype.once = function(event, listener) {
  return this._addListenerInternal(event, listener, true);
}

EventEmitter.prototype._afterRemoveListener = function(event, info) {
  if (!--this._listeningDomains[info.domain.uid].count) {
    delete this._listeningDomains[info.domain.uid];
    // Don't detach from the parent.
    if (this.domain !== info.domain)
      this._detachDomain(info.domain);
  }

  this.emit('removeListener', event, info.listener);
}

EventEmitter.prototype.emit = function(event, err) {
  this._checkDone();

  if (event === 'error')
    return this._emitError(err);

  var events = this._events,
      listeners = (events[event] || []),
      listenersCopy = listeners.slice(),
      args = Array.prototype.slice.call(arguments, 1);

  for (var i = 0; i < listenersCopy.length; i++) {
    var info = listenersCopy[i];

    info.domain._apply(info.listener, info.domain, args);

    if (info.once) {
      var index = listeners.indexOf(info);
      if (index !== -1) {
        listeners.splice(index, 1);
        this._afterRemoveListener(event, info);
      }
    }
  }
}


EventEmitter.prototype.removeListener = function(event, listener) {
  this._checkDone();

  var events = this._events,
      listeners = this._events[event] || [];

  for (var i = 0; i < listeners.length; i++) {
    var info = listeners[i];

    if (info.listener === listener) {
      listeners.splice(i, 1);
      this._afterRemoveListener(event, info);
      break;
    }
  }
}

EventEmitter.prototype.removeAllListeners = function EventEmitter$removeAllListeners(type) {
  var events = this._events;

  if (type == null) {
    var types = Object.keys(events);
    for (var i = 0; i < types.length; i++) {
      type = types[i];
      if (type !== 'removeListener')
        this.removeAllListeners(type);
    }
    return this.removeAllListeners[type];
  }

  var listeners = this._events[type] || [];

  while (listeners.length) {
    this._afterRemoveListener(type, listeners[listeners.length - 1]);
    listeners.length--;
  }

  return this;
}

EventEmitter.prototype._emitError = function EventEmitter$finish(err) {
  assert(err);
  
  var listeningDomains = this._listeningDomains;
  var unhandledListeners = {};
  var handledByParent = false;
  for (var uid in listeningDomains) {
    if (!listeningDomains.hasOwnProperty(uid))
      continue;
    unhandledListeners[uid] = listeningDomains[uid].domain;
  }

  var errorListeners = this._events['error'] || [],
      errorListenersCopy = errorListeners.slice();

  for (var i = 0; i < errorListenersCopy.length; i++) {
    var info = errorListenersCopy[i];
    delete unhandledListeners[info.domain.uid];
    if (info.domain === this.domain)
      handledByParent = true;
    info.domain._apply(info.listener, info.domain, [err]);
  }

  for (var uid in unhandledListeners) {
    if (!unhandledListeners.hasOwnProperty(uid))
      continue;
    print('EE %d: Error; cleaning up task %d', this.uid, uid);
    unhandledListeners[uid].throw(err);
  }

  if (!handledByParent) {
    print('EE %d: Error; cleaning up parent: %d', this.uid, this.domain.uid);
    this.domain.throw(err);
  }
}

EventEmitter.prototype._ontaskcomplete = function(domain, err) {
  // This shouldn't be called when done because all finalizers should be removed.
  print('EE %d: parent task completed: %d', this.uid, domain.uid);
  assert(!this._done);

  if (err)
    this._emitError(err);
  
  return true;
}

EventEmitter.prototype._ontaskexit = function(domain, err) {
  return;
  print('EE %d: parent task exited: %d', this.uid, domain.uid);
  // This should only happen from the parent domain since all other domains are ref'ed.
  assert(domain === this.domain);
  
  if (err)
    this._error(err);

  this.finalize();
}

EventEmitter.prototype.finalize = function() {
  if (this._done)
    return;
    
  this.removeAllListeners();  
  this._done = true;
}

module.exports = EventEmitter;
EventEmitter.EventEmitter = EventEmitter;