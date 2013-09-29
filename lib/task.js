
var inherits = require('_inherits').inherits;

var id_counter = 0;

function assert(expr) {
  if (!expr)
    throw new Error('Assertion failure');
}

function newId() {
  return id_counter++;
}


function InternalTask() {
  this.id = this._id = newId(); 
  this._subtasks = {};
  this._subtaskCount = 0;
  this._resources = 
  this._parent = null;
  this._callback = this._defaultCallback;
  this._result = undefined;
  this._error = undefined;
  this._endCheckScheduled = false;
  this._ended = false;
}

InternalTask.prototype._defaultCallback = function() {
  console.log("Task %s has no callback", this.constructor.name);
}

InternalTask.prototype._setParent = function(parent) {
  // TODO(bert) this is only to make it work for the root task. Better solution.
  if (this === process || !parent)
    return;
  assert(this._parent === null);
  // TODO: make _parent a normal property.
  // this._parent = parent;
  // for now we make it non-enumerable for easier inspection
  Object.defineProperty(this, '_parent', { value: parent, enumerable: false });
  parent._register(this);
}

InternalTask.prototype._clearParent = function() {
  // TODO(bert) make this nicer
  if (this === process || !this._parent)
    return;
  assert(this._parent);
  this._parent._unregister(this);
  this._parent = null;
}

InternalTask.prototype._register = function(subtask) {
  assert(subtask._parent === this);
  assert(!this._ended);
  assert(!this._subtasks[subtask._id]);

  this._subtasks[subtask._id] = subtask;
  this._subtaskCount++;
}

InternalTask.prototype._unregister = function(subtask) {
  assert(subtask._parent === this);
  assert(!this._ended);
  assert(this._subtasks[subtask._id]);

  delete this._subtasks[subtask._id];

  if (--this._subtaskCount === 0)
    this._scheduleEndCheck();
}



// These methods can be overwritten by implementors, *but* it's dangerous.
// We probably need some sugar to make this easier.
InternalTask.prototype._complete = function(err) {
  // By default we will set this value as the final result value,
  // and abort any children.
  if (this._result)
    throw new Error("Task has already been completed");
  else if (this._ended)
    throw new Error("Callback was previously lost, so it's task has been implicitly completed already.");

  if (err)
    this._fail(err);
  else
    this._result = Array.prototype.slice.call(arguments, 1);

  // Notify all children that the task has reached a final result value
  // and the parent tasks no longer needs them.
  this._abandonChildren();
}

InternalTask.prototype._fail = function(err) {
  if (!this._error)
    this._error = err;

  // Notify all children that their parent task has failed and there's no
  // sense in running to completion.
  this._abandonChildren(err);
}

InternalTask.prototype._scheduleEndCheck = function() {
  //console.trace("ScheduleEndCheck %d", this.id);
  if (this._endCheckScheduled)
    return;

  this._endCheckScheduled = true;
  process.nextTickInternal(this._endCheck.bind(this));
}

InternalTask.prototype._endCheck = function() {
  this._endCheckScheduled = false;

  if (this._subtaskCount === 0)
    this._end();
}

InternalTask.prototype._end = function() {
  var parent = this._parent;

  this._ended = true;
  this._clearParent();

  // Here we call the callback. By default we won't warn the caller about missing a callback.
  if (this._error)
    parent._apply(this._callback, [this._error])
  else {
    // Construct array with arguments
    var result = this._result || [],
        args = new Array(result.length + 1);

    args[0] = null;
    for (var i = 0; i < result.length; i++)
      args[i + 1] = result[i];

    if (parent)
      parent._apply(this._callback, args);
    else
      // TODO(bert) fixme
      this._callback.apply(null, args);
  }
}

InternalTask.prototype._abandon = function(err) {
  // By default we don't do anything except filtering down the abortion request.
  this._abandonChildren(err);
}

InternalTask.prototype._run = function(fn) {
  assert(!this._ended);

  var completer = this._complete.bind(this);

  var savedTask = currentTask;
  currentTask = this;
  try {
    fn.call(this, completer);
  } catch (e) {
    this._fail(e);
  } finally {
    currentTask = savedTask;
  }
}

InternalTask.prototype._apply = function(fn, args) {
  assert(!this._ended);

  var savedTask = currentTask;
  currentTask = this;
  try {
    fn.apply(this, args);
  } catch (e) {
    this._fail(e); 
  } finally {
    currentTask = savedTask;
  }
}

InternalTask.prototype._abandon = function() {
  //throw new Error("Not implemented");
}

InternalTask.prototype._abandonChildren = function(err) {
  var subtasks = this._subtasks;

  for (var key in subtasks) {
    if (subtasks.hasOwnProperty(key)) {
      var subtask = subtasks[key];
      subtask._apply(subtask._abandon, [err]);
    }
  }
}


InternalTask.prototype.setCallback = function(callback) {
  if (this._callback !== this._defaultCallback)
    throw new Error("Callback has already been set");

  if (callback === null || callback === undefined)
    return;

  this._callback = callback;
}


function Task(fn) {
  InternalTask.call(this);
  this._setParent(currentTask);
  this._run(fn);
  this._scheduleEndCheck();
}

inherits(Task, InternalTask);

function DetachedTask(fn, parent) {
  InternalTask.call(this);
  this._setParent(parent);
  this._run(fn);
  this._scheduleEndCheck();
}

inherits(DetachedTask, InternalTask);

function create(fn) {
  return new Task(fn);
}

function detached(fn) {
  return new DetachedTask(fn);
}

function WrapperTask(callback) {
  InternalTask.call(this);
  this._setParent(currentTask);
  this._callback = callback;
  this._complete = this._complete.bind(this);
  this._complete.task = this;
}

WrapperTask.prototype.getCallback = function() {
  return this._complete;
}

inherits(WrapperTask, Task);

function wrap(callback) {
  var task = new WrapperTask(callback);
  return task.getCallback();

}

function TickTask(callback) {
  InternalTask.call(this);
  this._setParent(currentTask);
  this._callback = callback;
  this._complete();
  this._scheduleEndCheck();
}

inherits(TickTask, Task);


exports.Task = Task;
exports.DetachedTask = DetachedTask;

exports.InternalTask = InternalTask;
exports.TickTask = TickTask;
exports.WrapperTask = WrapperTask;

exports.newId = newId;

exports.create = create;
exports.detached = detached;
exports.wrap = wrap;