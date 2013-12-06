

var inherits = require('util').inherits;
var format = require('util').format;
var assert = require('assert');
var net = require('net');
var util = require('util');

process.stdout;
process.stderr;

var Task = require('domain').Task;


var print = function() {
  var s = format.apply(null, arguments);
  process._rawDebug(s);
}

/* 
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

*/



var testEmitter;

/*new Task(function EmitterTestTask(done) {
  testEmitter = new EventEmitter();

  testEmitter.on('test', function(a, b) {
    console.log('test event %s %s', a, b);
    //if (b === 4)
    //  testEmitter.removeListener('test', arguments.callee);
  });

  testEmitter.once('test', function(c, d) {
    console.log('test once %s %s', c, d);
  });

  testEmitter.on('test', function() {
    print('EmitterTestTask got event!');
  });
}).setCallback(function(err) {
  console.log('EmitterTestTask result: ', err);
});*/

/*
testEmitter.on('error', function(err) {
  console.log('process handled emitter error', err);
});

testEmitter.emit('test', 'foo', 3);
testEmitter.emit('test', 'bar', 4);
*/

//testEmitter.finish(new Error('foo!'));


new Task(function OuterTask() {
  var connection = net.createConnection(80, 'www.google.com');

  new Task(function ConnectionTask(done) {
    setTimeout(function() {
      connection.end("FAUT\r\n");
    }, 1000);

    done(undefined, 41);
  }).setCallback(function(err, val) {
    console.log('Result: %s, value: %s', err, val);
  });

  new Task(function TestTask(done) {
    connection.on('data', function(x) {
      console.log('data: %s', x.toString());
    });
    connection.once('close', function() {
      console.log('connection closed!');
    });
    //process.nextTick(function() {
    print(new Error().stack);
    throw new Error('Really bad stuff');
    //});
  }).setCallback(function(err, val) {
    console.log('result 2: %s, %s', err, val);
  });
}).setCallback(function(err, val) {
  console.log('OuterTask completer: %s, %s', err, val);
});

setTimeout(console.log, 4000);