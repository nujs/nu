
var inherits = require('util').inherits;
var format = require('util').format;
var assert = require('assert');
var net = require('net');
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


function Resource() {

}