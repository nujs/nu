var task = require('task');

process.on('SIGWINCH', console.log);
process.removeListener('SIGWINCH', console.log);


console.log('startup: should be root task: %d', currentTask.id);
process.nextTick(function() {
  console.log('nextTick: should be root task: %d', currentTask.id);
});


task.create(function(cb) {
  console.log('task.create: should be user task: %d', currentTask.id);

  process.nextTick(function() {
    console.log('nextTick: should be user task: %d', currentTask.id);
    //cb(1);
  });

  process.nextTick(function() {
    console.log('nextTick[2]: should be user task: %d', currentTask.id);

    task.create(function(cb2) {
      console.log('sub-subtask %d', currentTask.id);

      process.nextTick(function() {
        cb2('done');
      });
    }).setCallback(cb);
  });


  //throw new Error("poep");
}).setCallback(function(err, result) {
  console.log('callback: back in task %d. error: %s. result: %s', currentTask.id, err, result);
});