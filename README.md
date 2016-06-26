## Summary
MultiWorker is a wrapper around the browser's native web worker API. Features include:
- Post data to workers and use callbacks to handle results.
- Queue processes across multiple worker threads.
- Build workers from functions, instead of needing a separate JS file.


## Installation
Install via NPM:
```bash
npm install --save multiworker
```

Or include the old fashioned way:
```HTML
<script src="dist/multiworker.min.js"></script>
```

## Usage
### Basic usage
A MultiWorker instance is created with a function which is used as the code for the worker.
``` js
var worker = new MultiWorker(function () {
    self.receive = function (n) {
        self.return(n + 1);
    }
});
```

In order to interact with the worker, we use the post method. This triggers the self.receive function inside the worker,
which returns a value with self.return.

``` js
worker.post(5, function (n) {
    console.log(n); // => 6
});
```

## Options
### worker
When creating a MultiWorker instance, a function can be passed:
``` js
var worker = new MultiWorker(function () {
    self.receive = self.return; // Simply return the input
});
```

Alternatively, a filepath can be used.
``` js
var worker = new MultiWorker('workers/example.js');

worker.post('foo', function () {
    // This post won't occur until example.js has been fetched and the worker is ready.
});
```

The worker can also be defined in an options object:
``` js
var worker = new MultiWorker({
    worker: function () {
        self.receive = self.return; // Simply return the input
    }
});
```
### callback
A function to be called whenever a worker sends a value back to the main program via self.post or self.return.
``` js
var worker = new MultiWorker({
    worker:   function () {
        self.receive = self.return; // Simply return the input
    },
    callback: function (val) {
        console.log(val);
    }
});

worker.post(1); // The callback function above will log 1 in the console
```

If a callback is passed as an argument when the post request is made, then the default callback is not used.
``` js
var worker = new MultiWorker({
    worker:   function () {
        self.receive = self.return; // Simply return the input
    },
    callback: function (val) {
        console.log(val);
    }
});

worker.post(1, function (val) {
    alert(val); // The callback function above will not be used. 1 will be alerted.
});
```

### threads
The number of workers to spawn. The default is 1.

**Multiple web workers:**
``` js
var worker = new MultiWorker({
    worker:  function () {
        self.receive = self.return; // Simply return the input
    },
    threads: 2
});

// The posts below are processed in parallel.
// There is a chance that the second post will return first.
worker
        .post(42)
        .post(11);
```

**A single web worker:**
``` js
var worker = new MultiWorker({
    worker:  function () {
        self.receive = self.return; // Simply return the input
    },
    threads: 1
});

// The posts below are processed in series.
worker
        .post(42)
        .post(11);
```

### dependencies
An array of named functions that can be used globally in the workers. These functions must be named and not make references to data outside the function scope.

``` js
var worker = new MultiWorker({
    worker:       function () {
        self.receive = function (n1, n2) {
            self.return(multiply(n1, n2) + add(n1, n2));
        }
    },
    dependencies: [
        function multiply(n1, n2) {
            return n1 * n2;
        },
        function add(n1, n2) {
            return n1 + n2;
        }
    ]
});

worker.post(10, 2, function (n) {
    console.log(n); // => 32
});
```


## MultiWorker Methods
### post([...args], [callback])
Interact with a MultiWorker instance. This method accepts an arbitrary number of parameters, which the worker can access
with the self.receive method.

A callback can be passed - this is used instead of any default callback that may have been defined when
creating the worker instance.

``` js
var worker = new MultiWorker(function () {
    self.receive = function (n1, n2) {
        self.return(n1 + n2);
    }
});

worker.post(2, 2, function (result) {
    console.log(result); // => 4
});
```

### terminate([callback | instant])
Terminates the MultiWorker instance. The instance can no longer be used once this method has been called.
``` js
// Wait for post to return, then terminate
worker.post(10).terminate();
```

``` js
// Wait for post to return, then terminate and run the callback
worker.post(10).terminate(function () {
    console.log('Worker terminated');
});
```

``` js
// Terminate instantly, without waiting for result from any pending posts
worker.post(10).terminate(true);
```

## Worker Methods
A few methods are made available inside the workers. These are attached to the
self object.

### self.receive([...args])
Fired in response to calling post() on a MultiWorker instance. This is the start of any process from within a worker.
``` js
var worker = new MultiWorker(function () {
    self.receive = function (n1, n2) {
        self.return(n1 + n2);
    }
});

worker.post(2, 2, function (result) {
    console.log(result); // => 4
});
```

### self.return([...args])
Sends a response back to the main thread.
This will be called inside of self.receive - see the code example for that method for usage.


### self.post([...args])
Similar to self.return, but will not mark the current task as finished. self.return must be called after all work is
done in order to start processing the next item in the queue.
``` js
var worker = new MultiWorker({
    worker:   function () {
        self.receive = function () {
            var i = 100;

            // A pointless loop to demonstrate.
            // A real-world usage could be a progress bar.
            while (i--) {

                if (i) {
                    self.post(i);
                } else {
                    self.return(i);
                }

            }

        }
    },
    callback: function (n) {
        if (!this.done) {
            console.log('left to complete: ' + n);
        } else {
            console.log('Finished');
        }
    }
});


worker
        .post()
        .post(); // This second post won't execute until self.return is called in response to the previous post.
```



## Compatibility
| IE | Edge | Firefox | Chrome | Safari | Safari  iOS | Android |
|----|------|---------|--------|--------|-------------|---------|
| 10 | Yes  | 6       | 23     | 6      | 6.1         | 5       |


## License
This project is licensed under the ISC License - see the [LICENSE.md](LICENSE.md) file for details
