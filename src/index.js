import Worker from 'web-worker';
import {
  get, functionToInstantString, noop, stringifyFunctionList,
} from './util.js';
import Post from './Post.js';
import WorkerMessage from './WorkerMessage.js';
import workerString from './workerString.js';

const _isWorkerBusy = new WeakMap();

class MultiWorker {
  /**
   * @param {Object|Function|String} options An object of options, or simply a function or URL
   * string to a JS file.
   * @param {Function} options.callback Default callback used for all responses from workers where
   * one is not provided with the post method.
   * @param {Number} [options.threads=1] Number of workers to spawn.
   * @param {Function[]} [options.dependencies] Array of named functions that can be used globally
   * in the workers. These functions must be named and not make references to data outside the
   * function scope.
   */
  constructor(worker, options) {
    if (typeof worker === 'string' || typeof worker === 'function') {
      options = options || {};
      options.worker = worker;
    } else {
      options = worker;
    }
    worker = (options.worker !== undefined) ? options.worker : options;

    if (typeof worker === 'string') {
      get(worker, (text) => {
        this.worker = text;
        this._init();
      });
    } else if (typeof worker === 'function') {
      setTimeout(() => {
        this.worker = functionToInstantString(worker);
        this._init();
      });
    }

    // Set properties from settings
    //--------------------------------------------------
    this.callback = options.callback || noop;
    this.threads = options.threads || 1;
    this.dependencies = options.dependencies || [];

    // Set generic properties
    //--------------------------------------------------
    this._initProperties();
  }

  /**
   * Send a message to the MultiWorker instance. Accepts an arbitrary number of arguments, followed
   * by an optional callback to deal with the response from the worker.
   *
   * @param {...*} arguments
   * @param {Function} [callback]
   * @param {Array<Transferable>} [transfers]
   * @returns {MultiWorker}
   */
  post(...args) {
    const transfers = Array.isArray(args[args.length - 1]) ? args.pop() : undefined;
    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : this.callback;

    this._process(args, cb, transfers);

    return this;
  }

  /**
   * Terminate the instance. All workers associated with the instance will be terminated. Once this
   * method is called, the instance can no longer be used.
   *
   * By default, all current and queued processes will finish before the instance is terminated,
   * unless true is passed as first parameter.
   *
   * If a function is passed as the first parameter, the instance will wait to complete the current
   * queue, as per default behaviour, then execute the callback once finished.
   *
   * @param {Boolean|Function} [instant=false] Set to true to terminate immediately, or pass a
   * callback function
   * @param {function} [callback]
   * @returns {MultiWorker}
   *
   * @example
   *       // Wait for post to return, then terminate
   *     worker.post(10).terminate();
   *
   *     // Wait for post to return, then terminate and run the callback
   *     worker.post(10).terminate(function() { console.log('foo') });
   *
   *     // Terminate instantly, without waiting for result from post
   *     worker.post(10).terminate(true);
   */
  terminate(instant = false, callback) {
    if (typeof instant === 'function') {
      callback = instant;
      instant = false;
    }

    if (instant || (this.ready && !this.processCount)) {
      this.workerList.forEach((worker) => worker.terminate());
      this._initProperties();
      this.threads = 0;
      delete this.terminateWhenFree;
      if (typeof callback === 'function') callback();
    } else {
      this.terminateWhenFree = callback || true;
    }
    return this;
  }

  _init() {
    this.ready = true;
    this._initThreads();
    this._processQueue();
  }

  _process(args, cb, transfers) {
    const worker = this._availableWorker;
    const post = new Post(transfers);

    const payload = {
      args: args,
      post: post
    }

    if (this.ready && worker) {
      this._inProgressData[post.id] = {
        cb,
        worker,
      };

      worker.postMessage(payload, transfers);
      _isWorkerBusy.set(worker, true);
      this.processCount++;
    } else {
      this.queue.push([args, cb, transfers]);
    }
  }

  _initProperties() {
    this.ready = false;
    this.workerList = [];
    this.queue = [];
    this.processCount = 0;
    this._inProgressData = {};
  }

  _initThreads() {
    let i = this.threads;
    while (i--) {
      const worker = new Worker(this._blobUrl);

      worker.addEventListener('message', this.constructor._defaultMessageEvent.bind(this), false);
      this.workerList.push(worker);
    }
  }

  /**
   * The default event function used internally to handle messages coming from the workers.
   *
   * @private
   * @param event
   */
  static _defaultMessageEvent(event) {
    const post = event.data.post;
    const { cb } = this._inProgressData[post.id];
    const context = new WorkerMessage(this, post, event);

    if (post.done) {
      this._processFinished(post.id);
    }

    cb.apply(context, event.data.args);

    if (post.done) {
      this._processQueue();
    }
  }

  _processFinished(id) {
    this.processCount--;
    const { worker } = this._inProgressData[id];
    _isWorkerBusy.set(worker, false);
    delete this._inProgressData[id];
    return this;
  }

  _processQueue() {
    if (this.queue.length && this.processCount < this.threads) {
      const nextProcess = this.queue.shift();
      this._process(...nextProcess);
      this._processQueue();
    } else if (this.terminateWhenFree && !this.processCount) {
      this.terminate(true, this.terminateWhenFree);
    }
    return this;
  }

  /**
   * Return first free worker or false
   *
   * @private
   * @returns {Worker|Boolean}
   */
  get _availableWorker() {
    const list = this.workerList;
    for (let i = 0, len = list.length; i < len; i++) {
      if (!_isWorkerBusy.get(list[i])) {
        return list[i];
      }
    }
    return false;
  }

  /**
   * Return the full worker JavaScript code to be run inside the worker as a string.
   *
   * @private
   * @returns {String}
   */
  get _workerString() {
    return workerString.replace('\'__MultiWorker_placeholder__\';', this._dependencyString + this.worker);
  }

  /**
   * Generate and return a blobUrl URL to be used by the workers.
   *
   * @private
   * @returns {String}
   */
  get _blobUrl() {
    if (!this._blobUrlCached) {
      this._blobUrlCached = typeof Blob === 'undefined'
        ? `data:text/javascript;base64,${Buffer.from(this._workerString, 'binary').toString('base64')}`
        : URL.createObjectURL(new Blob([this._workerString], {
          type: 'application/javascript',
        }));
    }
    return this._blobUrlCached;
  }

  /**
   * Return a string representation of the instance's dependency functions to be added to the
   * worker code string.
   *
   * @private
   * @returns {String}
   */
  get _dependencyString() {
    return stringifyFunctionList(this.dependencies);
  }
}

export default MultiWorker;
