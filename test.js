
var inherits = require('util').inherits;
var format = require('util').format;
var assert = require('assert');
var net = require('net');
var util = require('util');

process.stdout;
process.stderr;

var print = function() {
  var s = format.apply(null, arguments);
  process._rawDebug(s);
}

function tab(n) {
  return new Array(1 + n * 2).join('  ');
}

var doStack = false;
var i = 0;
var current, root;
var uid = 0;
var depth = 0;

function EventSource(name) {
  this.uid = ++uid;

   if (uid === 18) {
    try {
      throw new Error(name);
    } catch (e) {
      print(e.stack);
    }
  }


  this.name = (name || this.constructor.name) + '#' + this.uid;

  if (this._isRoot) {
    this.domain = current = root = this;
    this.depth = 0;
    return;
  }

  this.domain = current;
  this.depth = current.depth + 1;

  // Register
  current.addRef(this);
  this._refed = true;

  print('%s%s created', tab(this.depth), this.name);
}
EventSource._isRoot = false;

function Domain(name) {
  EventSource.call(this, name);
  var self = this;
  this._refs = 0;
  this._refIndex = {};
  this._finalizers = {};
}
inherits(Domain, EventSource);
Domain.prototype.addRef = function addRef(item) {
  print('%s%s referenced by %s: %d -> %d', tab(this.depth), this.name, item.name, this._refs, this._refs + 1);
  ++this._refs;
  this._refIndex[item.uid] = item;
}
Domain.prototype.delRef = function delRef(item) {
  print('%s%s dereferenced by %s: %d -> %d', tab(this.depth), this.name, item.name, this._refs, this._refs - 1);
  --this._refs;
  delete this._refIndex[item.uid];
  var left = [];
  for (var key in this._refIndex) {
    left.push(this._refIndex[key].name)
  }
  print('%s- left: %s', tab(this.depth), left.join(', '));
}
Domain.prototype.addFinalizer = function(finalizer) {
  var uid = finalizer.uid;
  assert(typeof uid === 'number');
  assert(!this._finalizers[uid]);
  this._finalizers[uid] = finalizer;
}
Domain.prototype.removeFinalizer = function(finalizer) {
  var uid = finalizer.uid;
  assert(typeof uid === 'number');
  assert(this._finalizers[uid]);
  delete this._finalizers[uid];
}
Domain.prototype._callFinalizers = function(method, err) {
  var finalizers = this._finalizers;
  for (var uid in finalizers) {
    if (!finalizers.hasOwnProperty(uid))
      continue;
    var finalizer = finalizers[uid];
    if (!finalizer[method])
      continue;
    if (finalizer[method](err))
      delete finalizers[uid];
  }
}
Domain.prototype._apply = function Domain$_apply(fn, self, args) {
  var prev = current;
  var rv;
  current = this;
  try {
    rv = fn.apply(self, args);
  } finally {
    current = prev;
  }
  return rv;
}
Domain.prototype.link = function(fn) {
  if (this === current)
    return fn;

  var target = current;
  var source = this;
  var done = false;

  function wrapped() {
    if (done) {
      throw new Exception('Callback already made');
    }

    done = true;

    target.delRef(wrapped);

    target.removeFinalizer(wrapped);
    source.removeFinalizer(wrapped);

    var prev = current;
    current = target;
    fn.apply(this, argument);
    current = prev;
  }

  wrapped.uid = ++uid;

  wrapped.unlink = function(err) {
    wrapped(err || new Error('Callback source domain exited'));
  }

  target.addRef(wrapped);
  target.addFinalizer(wrapped);
  source.addFinalizer(wrapped);

  return wrapped;
}

Domain.prototype.throw = function(err) {
  throw err;
}

function RootDomain() {
  this._isRoot = true;
  Domain.call(this);
}
inherits(RootDomain, Domain);

function Task(cb) {
  Domain.call(this, cb.name);
  this._onStack = false;
  this._checkScheduled = false;
  this.result = undefined;
  this._callback = undefined;
  if (cb)
    this.run(cb);
}
inherits(Task, Domain);
Task.prototype.run = function(cb) {
  var self = this;

  if (this._onStack)
    throw new Error("Can't enter task recursively");

  var prev = current;
  current = this;

  this._onStack = true;
  cb(setResult);
  this._onStack = false;

  current = prev;

  if (this._refs === 0 && !this._checkScheduled) {
    this._checkScheduled = true;

    current = this.domain;
    process.nextTick(function() {
      self.check();
    });
  }

  function setResult() {
    if (!self.result)
      self.result = arguments;
  }

}
Task.prototype.addRef = function(item) {
  Domain.prototype.addRef.call(this, item);
}

Task.prototype.delRef = function(item) {
  Domain.prototype.delRef.call(this, item);
  if (this._refs === 0 && !this._onStack && !this._checkScheduled) {
    this._checkScheduled = true;

    var self = this;
    var prev = current;
    current = this.domain;
    process.nextTick(function() {
      self.check();
    });
    current = prev;
  }
}

Task.prototype.check = function() {
  assert(current === this.domain);
  this._checkScheduled = false;

  if (this._refs !== 0)
    return;

  // Remove finalizers
  // Unref
  this.domain.delRef(this);

  // Call callback
  if (this._callback) {
    this._callback.apply(this, this.result);
  }
}

Task.prototype.setCallback = function(callback) {
  if (!this._callback)
    this._callback = callback;
  else
    throw new Error('Callback already set');
}

Task.prototype.throw = function(err) {
  this.result = [err];
}

new RootDomain();

function pre(val, context) {
  return new EventSource(context.constructor.name);
}


function before(context, value, isFinal) {
  current = value.domain;

  if (isFinal) {
    if (!value._refed == true) {
      throw new Error('Not Refed!');
    }
    current.delRef(value);
    value._refed = false;
  }
}

function after(context, value, isFinal) {
}

process.on('uncaughtException', function(err) {
  console.log('uncaught');
  current.throw(err);
});

process.addAsyncListener(pre, { before: before, after: after });

var t = new Task(function TestTask(done) {
  var x = setInterval(function() {
    print("interval");
    doStack = true;
    if (++i > 3)
      clearInterval(x);
  }, 100);

  setImmediate(function() {
    print("immediate");
  });
});
t.setCallback(function(err, result) {
  print('Task done!');
  var t = new Task(function NetTask(done) {
    var conn = net.createConnection(80, 'www.google.com');
    done(null, 42);
    setTimeout(function() {
      conn.destroy();
      throw new Error('poep');
    }, 100);
  });
  t.setCallback(function(err, result) {
    print('All done, %s, %s', err, result);
  });
});

function EventEmitter() {
  this.domain = current;
  this._done = false;
  this._listeningDomains = {};
  this._events = {};
}

EventEmitter.prototype._checkDone = function() {
  if (this._done)
    throw new Error("This EventEmitter is done");
}

EventEmitter.prototype._addListenerInternal = function(event, listener, once) {
  if (!util.isFunction(listener))
    throw TypeError('listener must be a function');

    this._checkDone();

  var listeningDomains = this._listeningDomains,
      events = this._events;

  if (!listeningDomains[current.uid])
    listeningDomains[current.uid] = { count: 1, domain: current };
  else
    listeningDomains[current.uid].count++;

  if (!events[event])
    events[event] = [];

  events[event].push({ domain: current, listener: listener, once: once});
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
    this._detachDomain(info.domain);
  }

  this.emit('removeListener', event, info.listener);
}

EventEmitter.prototype.emit = function(event, err) {
  this._checkDone();

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
      listeners.splice(index, 1);
      this._afterRemoveListener(event, info);
      break;
    }
  }
}



var testEmitter = new EventEmitter();

testEmitter.on('test', function(a, b) {
  console.log('test event %s %s', a, b);
});

testEmitter.once('test', function(c, d) {
  console.log('test once %s %s', c, d);
});

testEmitter.emit('test', 'foo', 3);
testEmitter.emit('test', 'bar', 4);
