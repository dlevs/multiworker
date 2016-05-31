(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.MultiWorker = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var count = 0;

var Post = function Post() {
	_classCallCheck(this, Post);

	this.id = count++;
	this.done = false; // This flag is set to true by the worker when it has finished its task
};

module.exports = Post;

},{}],2:[function(_dereq_,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var MultiWorkerMessage = function MultiWorkerMessage(instance, post, event) {
	_classCallCheck(this, MultiWorkerMessage);

	this.event = event;
	this.done = !!post.done;
	this.instance = instance;
};

module.exports = MultiWorkerMessage;

},{}],3:[function(_dereq_,module,exports){
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var util = _dereq_('./util');
var Post = _dereq_('./Post');
var WorkerMessage = _dereq_('./WorkerMessage');
var workerString = _dereq_('./workerString');

var _isWorkerBusy = new WeakMap();

var MultiWorker = function () {

	/**
  * @param {Object|Function|String} options - An object of options, or simply a function or URL string to a JS file.
  * @param {Function} options.callback - Default callback used for all responses from workers where one is not provided with the post method.
  * @param {Number} [options.threads=1] - Number of workers to spawn.
  * @param {Function[]} [options.dependencies] - Array of named functions that can be used globally in the workers. These functions must be named and not make references to data outside the function scope.
  */

	function MultiWorker(options) {
		var _this = this;

		_classCallCheck(this, MultiWorker);

		// Get the worker code
		//--------------------------------------------------
		var worker = options.worker !== undefined ? options.worker : options;

		if (typeof worker === 'string') {
			util.get(worker, function (text) {
				_this.worker = text;
				_this._init();
			});
		} else if (typeof worker === 'function') {
			this.worker = util.functionToInstantString(worker);
		}

		// Set properties from settings
		//--------------------------------------------------
		this.callback = options.callback || util.noop;
		this.threads = options.threads || 1;
		this.dependencies = options.dependencies || [];

		// Set generic properties
		//--------------------------------------------------
		this._initProperties();

		// Init if worker is available
		//--------------------------------------------------
		if (this.worker) this._init();
	}

	/**
  * Send a message to the MultiWorker instance. Accepts an arbitrary number of arguments, followed by an optional
  * callback to deal with the response from the worker.
  *
  * @param {...*} arguments
  * @param {Function} callback
  * @returns {MultiWorker}
  */


	_createClass(MultiWorker, [{
		key: 'post',
		value: function post() {
			var args = Array.prototype.slice.call(arguments),
			    cb = typeof args[args.length - 1] === 'function' ? args.pop() : this.callback;

			this._process(args, cb);

			return this;
		}

		/**
   * Terminate the instance. All workers associated with the instance will be terminated. Once this method is called,
   * the instance can no longer be used.
   *
   * By default, all current and queued processes will finish before the instance is terminated, unless true is passed
   * as first parameter.
   *
   * If a function is passed as the first parameter, the instance will wait to complete the current queue, as per
   * default behaviour, then execute the callback once finished.
   *
   * @param {Boolean|Function} [instant=false] - Set to true to terminate immediately, or pass a callback function
   * @param {function} [callback]
   * @returns {MultiWorker}
   *
   * @eample
   *       // Wait for post to return, then terminate
   *     worker.post(10).terminate();
   *
   *     // Wait for post to return, then terminate and run the callback
   *     worker.post(10).terminate(function() { console.log('foo') });
   *
   *     // Terminate instantly, without waiting for result from post
   *     worker.post(10).terminate(true);
   */

	}, {
		key: 'terminate',
		value: function terminate() {
			var instant = arguments.length <= 0 || arguments[0] === undefined ? false : arguments[0];
			var callback = arguments[1];

			if (typeof instant === 'function') {
				callback = instant;
				instant = false;
			}

			if (instant || this.ready && !this.processCount) {
				this.workerList.forEach(function (worker) {
					return worker.terminate();
				});
				this._initProperties();
				this.threads = 0;
				delete this.terminateWhenFree;
				if (typeof callback === 'function') callback();
			} else {
				this.terminateWhenFree = callback || true;
			}
			return this;
		}
	}, {
		key: '_init',
		value: function _init() {
			this.ready = true;
			this._initThreads();
			this._processQueue();
		}
	}, {
		key: '_process',
		value: function _process(args, cb) {
			var worker = this._availableWorker,
			    post = new Post();

			args.push(post);

			if (this.ready && worker) {
				this._inProgressData[post.id] = {
					cb: cb,
					worker: worker
				};

				worker.postMessage(args);
				_isWorkerBusy.set(worker, true);
				this.processCount++;
			} else {
				this.queue.push([args, cb]);
			}
		}
	}, {
		key: '_initProperties',
		value: function _initProperties() {
			this.ready = false;
			this.workerList = [];
			this.queue = [];
			this.processCount = 0;
			this._inProgressData = {};
		}
	}, {
		key: '_initThreads',
		value: function _initThreads() {
			var i = this.threads;
			while (i--) {
				var worker = new Worker(this._blobUrl);

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

	}, {
		key: '_processFinished',
		value: function _processFinished(id) {
			this.processCount--;
			var worker = this._inProgressData[id].worker;
			_isWorkerBusy.set(worker, false);
			delete this._inProgressData[id];
			return this;
		}
	}, {
		key: '_processQueue',
		value: function _processQueue() {
			if (this.queue.length && this.processCount < this.threads) {
				var nextProcess = this.queue.shift();
				this._process.apply(this, nextProcess);
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

	}, {
		key: '_availableWorker',
		get: function get() {
			var list = this.workerList;
			for (var i = 0, len = list.length; i < len; i++) {
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

	}, {
		key: '_workerString',
		get: function get() {
			return workerString.replace('\'__MultiWorker_placeholder__\';', this._dependencyString + this.worker);
		}

		/**
   * Generate and return a blobUrl URL to be used by the workers.
   *
   * @private
   * @returns {String}
   */

	}, {
		key: '_blobUrl',
		get: function get() {
			if (!this._blobUrlCached) {
				this._blobUrlCached = window.URL.createObjectURL(new Blob([this._workerString], {
					type: 'application/javascript'
				}));
			}
			return this._blobUrlCached;
		}

		/**
   * Return a string representation of the instance's dependency functions to be added to the worker code string.
   *
   * @private
   * @returns {String}
   */

	}, {
		key: '_dependencyString',
		get: function get() {
			return util.stringifyFunctionList(this.dependencies);
		}
	}], [{
		key: '_defaultMessageEvent',
		value: function _defaultMessageEvent(event) {
			var post = event.data.pop(),
			    cb = this._inProgressData[post.id].cb,
			    context = new WorkerMessage(this, post, event);

			if (post.done) {
				this._processFinished(post.id);
			}

			cb.apply(context, event.data);

			if (post.done) {
				this._processQueue();
			}
		}
	}]);

	return MultiWorker;
}();

module.exports = MultiWorker;

},{"./Post":1,"./WorkerMessage":2,"./util":4,"./workerString":5}],4:[function(_dereq_,module,exports){
'use strict';

/**
 * Returns a self-invoking, string representation of a function
 *
 * @param {Function} func
 * @returns {String}
 */

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.functionToInstantString = functionToInstantString;
exports.stringifyFunctionList = stringifyFunctionList;
exports.noop = noop;
exports.get = get;
function functionToInstantString(func) {
  return '(' + func.toString() + ')();';
}

/**
 * Returns a string representation of an array of functions.
 * Useful only if the functions are named.
 *
 * @param {Function[]} array - Array of functions
 * @returns {String}
 */
function stringifyFunctionList(array) {
  return array.reduce(function (prev, next) {
    return prev + next.toString() + ';';
  }, '');
}

/**
 * No operation
 */
function noop() {}

/**
 * Simple get request.
 *
 * @param {String} url
 * @param {Function} success
 */
function get(url, success) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      success(xhr.responseText);
    }
  };
  xhr.open('GET', url, true);
  xhr.send();
}

},{}],5:[function(_dereq_,module,exports){
'use strict';

var util = _dereq_('./util');

module.exports = util.functionToInstantString(function () {

	(function () {
		'use strict';

		var currentPost = void 0;

		function _sendPost() {
			var args = Array.prototype.slice.call(arguments);
			currentPost.done = args.shift();
			args.push(currentPost);
			postMessage(args);
		}

		self.return = _sendPost.bind(this, true);
		self.post = _sendPost.bind(this, false);

		self.addEventListener('message', function (e) {
			currentPost = e.data.pop();
			self.receive.apply(e, e.data);
		}, false);
	})();

	'__MultiWorker_placeholder__';
});

},{"./util":4}]},{},[3])(3)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvUG9zdC5qcyIsInNyYy9Xb3JrZXJNZXNzYWdlLmpzIiwic3JjL2luZGV4LmpzIiwic3JjL3V0aWwuanMiLCJzcmMvd29ya2VyU3RyaW5nLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7Ozs7QUFFQSxJQUFJLFFBQVEsQ0FBWjs7SUFFTSxJLEdBQ0wsZ0JBQWM7QUFBQTs7QUFDYixNQUFLLEVBQUwsR0FBWSxPQUFaO0FBQ0EsTUFBSyxJQUFMLEdBQVksS0FBWixDO0FBQ0EsQzs7QUFHRixPQUFPLE9BQVAsR0FBaUIsSUFBakI7OztBQ1hBOzs7O0lBRU0sa0IsR0FDTCw0QkFBWSxRQUFaLEVBQXNCLElBQXRCLEVBQTRCLEtBQTVCLEVBQW1DO0FBQUE7O0FBQ2xDLE1BQUssS0FBTCxHQUFnQixLQUFoQjtBQUNBLE1BQUssSUFBTCxHQUFnQixDQUFDLENBQUMsS0FBSyxJQUF2QjtBQUNBLE1BQUssUUFBTCxHQUFnQixRQUFoQjtBQUNBLEM7O0FBR0YsT0FBTyxPQUFQLEdBQWlCLGtCQUFqQjs7O0FDVkE7Ozs7OztBQUVBLElBQU0sT0FBZ0IsUUFBUSxRQUFSLENBQXRCO0FBQ0EsSUFBTSxPQUFnQixRQUFRLFFBQVIsQ0FBdEI7QUFDQSxJQUFNLGdCQUFnQixRQUFRLGlCQUFSLENBQXRCO0FBQ0EsSUFBTSxlQUFnQixRQUFRLGdCQUFSLENBQXRCOztBQUVBLElBQU0sZ0JBQWdCLElBQUksT0FBSixFQUF0Qjs7SUFFTSxXOzs7Ozs7Ozs7QUFRTCxzQkFBWSxPQUFaLEVBQXFCO0FBQUE7O0FBQUE7Ozs7QUFJcEIsTUFBSSxTQUFVLFFBQVEsTUFBUixLQUFtQixTQUFwQixHQUFpQyxRQUFRLE1BQXpDLEdBQWtELE9BQS9EOztBQUVBLE1BQUksT0FBTyxNQUFQLEtBQWtCLFFBQXRCLEVBQWdDO0FBQy9CLFFBQUssR0FBTCxDQUFTLE1BQVQsRUFBaUIsZ0JBQVE7QUFD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LENBQW5CLEVBQXNCLEVBQUUsSUFBeEI7QUFDQSxHQUhELEVBR0csS0FISDtBQUlBLEVBbkJBLEdBQUQ7O0FBcUJBO0FBQ0EsQ0F4QmdCLENBQWpCIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIid1c2Ugc3RyaWN0JztcblxubGV0IGNvdW50ID0gMDtcblxuY2xhc3MgUG9zdCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuaWQgICA9IGNvdW50Kys7XG5cdFx0dGhpcy5kb25lID0gZmFsc2U7IC8vIFRoaXMgZmxhZyBpcyBzZXQgdG8gdHJ1ZSBieSB0aGUgd29ya2VyIHdoZW4gaXQgaGFzIGZpbmlzaGVkIGl0cyB0YXNrXG5cdH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBQb3N0O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5jbGFzcyBNdWx0aVdvcmtlck1lc3NhZ2Uge1xuXHRjb25zdHJ1Y3RvcihpbnN0YW5jZSwgcG9zdCwgZXZlbnQpIHtcblx0XHR0aGlzLmV2ZW50ICAgID0gZXZlbnQ7XG5cdFx0dGhpcy5kb25lICAgICA9ICEhcG9zdC5kb25lO1xuXHRcdHRoaXMuaW5zdGFuY2UgPSBpbnN0YW5jZTtcblx0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IE11bHRpV29ya2VyTWVzc2FnZTtcbiIsIid1c2Ugc3RyaWN0JztcblxuY29uc3QgdXRpbCAgICAgICAgICA9IHJlcXVpcmUoJy4vdXRpbCcpO1xuY29uc3QgUG9zdCAgICAgICAgICA9IHJlcXVpcmUoJy4vUG9zdCcpO1xuY29uc3QgV29ya2VyTWVzc2FnZSA9IHJlcXVpcmUoJy4vV29ya2VyTWVzc2FnZScpO1xuY29uc3Qgd29ya2VyU3RyaW5nICA9IHJlcXVpcmUoJy4vd29ya2VyU3RyaW5nJyk7XG5cbmNvbnN0IF9pc1dvcmtlckJ1c3kgPSBuZXcgV2Vha01hcCgpO1xuXG5jbGFzcyBNdWx0aVdvcmtlciB7XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB7T2JqZWN0fEZ1bmN0aW9ufFN0cmluZ30gb3B0aW9ucyAtIEFuIG9iamVjdCBvZiBvcHRpb25zLCBvciBzaW1wbHkgYSBmdW5jdGlvbiBvciBVUkwgc3RyaW5nIHRvIGEgSlMgZmlsZS5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gb3B0aW9ucy5jYWxsYmFjayAtIERlZmF1bHQgY2FsbGJhY2sgdXNlZCBmb3IgYWxsIHJlc3BvbnNlcyBmcm9tIHdvcmtlcnMgd2hlcmUgb25lIGlzIG5vdCBwcm92aWRlZCB3aXRoIHRoZSBwb3N0IG1ldGhvZC5cblx0ICogQHBhcmFtIHtOdW1iZXJ9IFtvcHRpb25zLnRocmVhZHM9MV0gLSBOdW1iZXIgb2Ygd29ya2VycyB0byBzcGF3bi5cblx0ICogQHBhcmFtIHtGdW5jdGlvbltdfSBbb3B0aW9ucy5kZXBlbmRlbmNpZXNdIC0gQXJyYXkgb2YgbmFtZWQgZnVuY3Rpb25zIHRoYXQgY2FuIGJlIHVzZWQgZ2xvYmFsbHkgaW4gdGhlIHdvcmtlcnMuIFRoZXNlIGZ1bmN0aW9ucyBtdXN0IGJlIG5hbWVkIGFuZCBub3QgbWFrZSByZWZlcmVuY2VzIHRvIGRhdGEgb3V0c2lkZSB0aGUgZnVuY3Rpb24gc2NvcGUuXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihvcHRpb25zKSB7XG5cblx0XHQvLyBHZXQgdGhlIHdvcmtlciBjb2RlXG5cdFx0Ly8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdGxldCB3b3JrZXIgPSAob3B0aW9ucy53b3JrZXIgIT09IHVuZGVmaW5lZCkgPyBvcHRpb25zLndvcmtlciA6IG9wdGlvbnM7XG5cblx0XHRpZiAodHlwZW9mIHdvcmtlciA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHV0aWwuZ2V0KHdvcmtlciwgdGV4dCA9PiB7XG5cdFx0XHRcdHRoaXMud29ya2VyID0gdGV4dDtcblx0XHRcdFx0dGhpcy5faW5pdCgpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2Ygd29ya2VyID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHR0aGlzLndvcmtlciA9IHV0aWwuZnVuY3Rpb25Ub0luc3RhbnRTdHJpbmcod29ya2VyKTtcblx0XHR9XG5cblx0XHQvLyBTZXQgcHJvcGVydGllcyBmcm9tIHNldHRpbmdzXG5cdFx0Ly8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdHRoaXMuY2FsbGJhY2sgICAgID0gb3B0aW9ucy5jYWxsYmFjayB8fCB1dGlsLm5vb3A7XG5cdFx0dGhpcy50aHJlYWRzICAgICAgPSBvcHRpb25zLnRocmVhZHMgfHwgMTtcblx0XHR0aGlzLmRlcGVuZGVuY2llcyA9IG9wdGlvbnMuZGVwZW5kZW5jaWVzIHx8IFtdO1xuXG5cdFx0Ly8gU2V0IGdlbmVyaWMgcHJvcGVydGllc1xuXHRcdC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHR0aGlzLl9pbml0UHJvcGVydGllcygpO1xuXG5cdFx0Ly8gSW5pdCBpZiB3b3JrZXIgaXMgYXZhaWxhYmxlXG5cdFx0Ly8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdGlmICh0aGlzLndvcmtlcikgdGhpcy5faW5pdCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgYSBtZXNzYWdlIHRvIHRoZSBNdWx0aVdvcmtlciBpbnN0YW5jZS4gQWNjZXB0cyBhbiBhcmJpdHJhcnkgbnVtYmVyIG9mIGFyZ3VtZW50cywgZm9sbG93ZWQgYnkgYW4gb3B0aW9uYWxcblx0ICogY2FsbGJhY2sgdG8gZGVhbCB3aXRoIHRoZSByZXNwb25zZSBmcm9tIHRoZSB3b3JrZXIuXG5cdCAqXG5cdCAqIEBwYXJhbSB7Li4uKn0gYXJndW1lbnRzXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrXG5cdCAqIEByZXR1cm5zIHtNdWx0aVdvcmtlcn1cblx0ICovXG5cdHBvc3QoKSB7XG5cdFx0bGV0IGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpLFxuXHRcdFx0Y2IgICA9IHR5cGVvZiBhcmdzW2FyZ3MubGVuZ3RoIC0gMV0gPT09ICdmdW5jdGlvbicgPyBhcmdzLnBvcCgpIDogdGhpcy5jYWxsYmFjaztcblxuXHRcdHRoaXMuX3Byb2Nlc3MoYXJncywgY2IpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogVGVybWluYXRlIHRoZSBpbnN0YW5jZS4gQWxsIHdvcmtlcnMgYXNzb2NpYXRlZCB3aXRoIHRoZSBpbnN0YW5jZSB3aWxsIGJlIHRlcm1pbmF0ZWQuIE9uY2UgdGhpcyBtZXRob2QgaXMgY2FsbGVkLFxuXHQgKiB0aGUgaW5zdGFuY2UgY2FuIG5vIGxvbmdlciBiZSB1c2VkLlxuXHQgKlxuXHQgKiBCeSBkZWZhdWx0LCBhbGwgY3VycmVudCBhbmQgcXVldWVkIHByb2Nlc3NlcyB3aWxsIGZpbmlzaCBiZWZvcmUgdGhlIGluc3RhbmNlIGlzIHRlcm1pbmF0ZWQsIHVubGVzcyB0cnVlIGlzIHBhc3NlZFxuXHQgKiBhcyBmaXJzdCBwYXJhbWV0ZXIuXG5cdCAqXG5cdCAqIElmIGEgZnVuY3Rpb24gaXMgcGFzc2VkIGFzIHRoZSBmaXJzdCBwYXJhbWV0ZXIsIHRoZSBpbnN0YW5jZSB3aWxsIHdhaXQgdG8gY29tcGxldGUgdGhlIGN1cnJlbnQgcXVldWUsIGFzIHBlclxuXHQgKiBkZWZhdWx0IGJlaGF2aW91ciwgdGhlbiBleGVjdXRlIHRoZSBjYWxsYmFjayBvbmNlIGZpbmlzaGVkLlxuXHQgKlxuXHQgKiBAcGFyYW0ge0Jvb2xlYW58RnVuY3Rpb259IFtpbnN0YW50PWZhbHNlXSAtIFNldCB0byB0cnVlIHRvIHRlcm1pbmF0ZSBpbW1lZGlhdGVseSwgb3IgcGFzcyBhIGNhbGxiYWNrIGZ1bmN0aW9uXG5cdCAqIEBwYXJhbSB7ZnVuY3Rpb259IFtjYWxsYmFja11cblx0ICogQHJldHVybnMge011bHRpV29ya2VyfVxuXHQgKlxuXHQgKiBAZWFtcGxlXG5cdCAqICAgICAgIC8vIFdhaXQgZm9yIHBvc3QgdG8gcmV0dXJuLCB0aGVuIHRlcm1pbmF0ZVxuXHQgKiAgICAgd29ya2VyLnBvc3QoMTApLnRlcm1pbmF0ZSgpO1xuXHQgKlxuXHQgKiAgICAgLy8gV2FpdCBmb3IgcG9zdCB0byByZXR1cm4sIHRoZW4gdGVybWluYXRlIGFuZCBydW4gdGhlIGNhbGxiYWNrXG5cdCAqICAgICB3b3JrZXIucG9zdCgxMCkudGVybWluYXRlKGZ1bmN0aW9uKCkgeyBjb25zb2xlLmxvZygnZm9vJykgfSk7XG5cdCAqXG5cdCAqICAgICAvLyBUZXJtaW5hdGUgaW5zdGFudGx5LCB3aXRob3V0IHdhaXRpbmcgZm9yIHJlc3VsdCBmcm9tIHBvc3Rcblx0ICogICAgIHdvcmtlci5wb3N0KDEwKS50ZXJtaW5hdGUodHJ1ZSk7XG5cdCAqL1xuXHR0ZXJtaW5hdGUoaW5zdGFudCA9IGZhbHNlLCBjYWxsYmFjaykge1xuXHRcdGlmICh0eXBlb2YgaW5zdGFudCA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0Y2FsbGJhY2sgPSBpbnN0YW50O1xuXHRcdFx0aW5zdGFudCAgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaW5zdGFudCB8fCAodGhpcy5yZWFkeSAmJiAhdGhpcy5wcm9jZXNzQ291bnQpKSB7XG5cdFx0XHR0aGlzLndvcmtlckxpc3QuZm9yRWFjaCh3b3JrZXIgPT4gd29ya2VyLnRlcm1pbmF0ZSgpKTtcblx0XHRcdHRoaXMuX2luaXRQcm9wZXJ0aWVzKCk7XG5cdFx0XHR0aGlzLnRocmVhZHMgPSAwO1xuXHRcdFx0ZGVsZXRlIHRoaXMudGVybWluYXRlV2hlbkZyZWU7XG5cdFx0XHRpZiAodHlwZW9mIGNhbGxiYWNrID09PSAnZnVuY3Rpb24nKSBjYWxsYmFjaygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRlcm1pbmF0ZVdoZW5GcmVlID0gY2FsbGJhY2sgfHwgdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRfaW5pdCgpIHtcblx0XHR0aGlzLnJlYWR5ID0gdHJ1ZTtcblx0XHR0aGlzLl9pbml0VGhyZWFkcygpO1xuXHRcdHRoaXMuX3Byb2Nlc3NRdWV1ZSgpO1xuXHR9XG5cblx0X3Byb2Nlc3MoYXJncywgY2IpIHtcblx0XHRsZXQgd29ya2VyID0gdGhpcy5fYXZhaWxhYmxlV29ya2VyLFxuXHRcdFx0cG9zdCAgID0gbmV3IFBvc3QoKTtcblxuXHRcdGFyZ3MucHVzaChwb3N0KTtcblxuXHRcdGlmICh0aGlzLnJlYWR5ICYmIHdvcmtlcikge1xuXHRcdFx0dGhpcy5faW5Qcm9ncmVzc0RhdGFbcG9zdC5pZF0gPSB7XG5cdFx0XHRcdGNiLFxuXHRcdFx0XHR3b3JrZXJcblx0XHRcdH07XG5cblx0XHRcdHdvcmtlci5wb3N0TWVzc2FnZShhcmdzKTtcblx0XHRcdF9pc1dvcmtlckJ1c3kuc2V0KHdvcmtlciwgdHJ1ZSk7XG5cdFx0XHR0aGlzLnByb2Nlc3NDb3VudCsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnF1ZXVlLnB1c2goW2FyZ3MsIGNiXSk7XG5cdFx0fVxuXHR9XG5cblx0X2luaXRQcm9wZXJ0aWVzKCkge1xuXHRcdHRoaXMucmVhZHkgICAgICAgICAgID0gZmFsc2U7XG5cdFx0dGhpcy53b3JrZXJMaXN0ICAgICAgPSBbXTtcblx0XHR0aGlzLnF1ZXVlICAgICAgICAgICA9IFtdO1xuXHRcdHRoaXMucHJvY2Vzc0NvdW50ICAgID0gMDtcblx0XHR0aGlzLl9pblByb2dyZXNzRGF0YSA9IHt9O1xuXHR9XG5cblx0X2luaXRUaHJlYWRzKCkge1xuXHRcdGxldCBpID0gdGhpcy50aHJlYWRzO1xuXHRcdHdoaWxlIChpLS0pIHtcblx0XHRcdGNvbnN0IHdvcmtlciA9IG5ldyBXb3JrZXIodGhpcy5fYmxvYlVybCk7XG5cblx0XHRcdHdvcmtlci5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgdGhpcy5jb25zdHJ1Y3Rvci5fZGVmYXVsdE1lc3NhZ2VFdmVudC5iaW5kKHRoaXMpLCBmYWxzZSk7XG5cdFx0XHR0aGlzLndvcmtlckxpc3QucHVzaCh3b3JrZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgZGVmYXVsdCBldmVudCBmdW5jdGlvbiB1c2VkIGludGVybmFsbHkgdG8gaGFuZGxlIG1lc3NhZ2VzIGNvbWluZyBmcm9tIHRoZSB3b3JrZXJzLlxuXHQgKlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0gZXZlbnRcblx0ICovXG5cdHN0YXRpYyBfZGVmYXVsdE1lc3NhZ2VFdmVudChldmVudCkge1xuXHRcdGxldCBwb3N0ICAgID0gZXZlbnQuZGF0YS5wb3AoKSxcblx0XHRcdGNiICAgICAgPSB0aGlzLl9pblByb2dyZXNzRGF0YVtwb3N0LmlkXS5jYixcblx0XHRcdGNvbnRleHQgPSBuZXcgV29ya2VyTWVzc2FnZSh0aGlzLCBwb3N0LCBldmVudCk7XG5cblx0XHRpZiAocG9zdC5kb25lKSB7XG5cdFx0XHR0aGlzLl9wcm9jZXNzRmluaXNoZWQocG9zdC5pZCk7XG5cdFx0fVxuXG5cdFx0Y2IuYXBwbHkoY29udGV4dCwgZXZlbnQuZGF0YSk7XG5cblx0XHRpZiAocG9zdC5kb25lKSB7XG5cdFx0XHR0aGlzLl9wcm9jZXNzUXVldWUoKTtcblx0XHR9XG5cdH1cblxuXHRfcHJvY2Vzc0ZpbmlzaGVkKGlkKSB7XG5cdFx0dGhpcy5wcm9jZXNzQ291bnQtLTtcblx0XHRsZXQgd29ya2VyID0gdGhpcy5faW5Qcm9ncmVzc0RhdGFbaWRdLndvcmtlcjtcblx0XHRfaXNXb3JrZXJCdXN5LnNldCh3b3JrZXIsIGZhbHNlKTtcblx0XHRkZWxldGUgdGhpcy5faW5Qcm9ncmVzc0RhdGFbaWRdO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0X3Byb2Nlc3NRdWV1ZSgpIHtcblx0XHRpZiAodGhpcy5xdWV1ZS5sZW5ndGggJiYgdGhpcy5wcm9jZXNzQ291bnQgPCB0aGlzLnRocmVhZHMpIHtcblx0XHRcdGxldCBuZXh0UHJvY2VzcyA9IHRoaXMucXVldWUuc2hpZnQoKTtcblx0XHRcdHRoaXMuX3Byb2Nlc3MuYXBwbHkodGhpcywgbmV4dFByb2Nlc3MpO1xuXHRcdFx0dGhpcy5fcHJvY2Vzc1F1ZXVlKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnRlcm1pbmF0ZVdoZW5GcmVlICYmICF0aGlzLnByb2Nlc3NDb3VudCkge1xuXHRcdFx0dGhpcy50ZXJtaW5hdGUodHJ1ZSwgdGhpcy50ZXJtaW5hdGVXaGVuRnJlZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiBmaXJzdCBmcmVlIHdvcmtlciBvciBmYWxzZVxuXHQgKlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcmV0dXJucyB7V29ya2VyfEJvb2xlYW59XG5cdCAqL1xuXHRnZXQgX2F2YWlsYWJsZVdvcmtlcigpIHtcblx0XHRjb25zdCBsaXN0ID0gdGhpcy53b3JrZXJMaXN0O1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaXN0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoIV9pc1dvcmtlckJ1c3kuZ2V0KGxpc3RbaV0pKSB7XG5cdFx0XHRcdHJldHVybiBsaXN0W2ldO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSBmdWxsIHdvcmtlciBKYXZhU2NyaXB0IGNvZGUgdG8gYmUgcnVuIGluc2lkZSB0aGUgd29ya2VyIGFzIGEgc3RyaW5nLlxuXHQgKlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfVxuXHQgKi9cblx0Z2V0IF93b3JrZXJTdHJpbmcoKSB7XG5cdFx0cmV0dXJuIHdvcmtlclN0cmluZy5yZXBsYWNlKCdcXCdfX011bHRpV29ya2VyX3BsYWNlaG9sZGVyX19cXCc7JywgdGhpcy5fZGVwZW5kZW5jeVN0cmluZyArIHRoaXMud29ya2VyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZW5lcmF0ZSBhbmQgcmV0dXJuIGEgYmxvYlVybCBVUkwgdG8gYmUgdXNlZCBieSB0aGUgd29ya2Vycy5cblx0ICpcblx0ICogQHByaXZhdGVcblx0ICogQHJldHVybnMge1N0cmluZ31cblx0ICovXG5cdGdldCBfYmxvYlVybCgpIHtcblx0XHRpZiAoIXRoaXMuX2Jsb2JVcmxDYWNoZWQpIHtcblx0XHRcdHRoaXMuX2Jsb2JVcmxDYWNoZWQgPSB3aW5kb3cuVVJMLmNyZWF0ZU9iamVjdFVSTChuZXcgQmxvYihbdGhpcy5fd29ya2VyU3RyaW5nXSwge1xuXHRcdFx0XHR0eXBlOiAnYXBwbGljYXRpb24vamF2YXNjcmlwdCdcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2Jsb2JVcmxDYWNoZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBpbnN0YW5jZSdzIGRlcGVuZGVuY3kgZnVuY3Rpb25zIHRvIGJlIGFkZGVkIHRvIHRoZSB3b3JrZXIgY29kZSBzdHJpbmcuXG5cdCAqXG5cdCAqIEBwcml2YXRlXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9XG5cdCAqL1xuXHRnZXQgX2RlcGVuZGVuY3lTdHJpbmcoKSB7XG5cdFx0cmV0dXJuIHV0aWwuc3RyaW5naWZ5RnVuY3Rpb25MaXN0KHRoaXMuZGVwZW5kZW5jaWVzKTtcblx0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IE11bHRpV29ya2VyO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFJldHVybnMgYSBzZWxmLWludm9raW5nLCBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgYSBmdW5jdGlvblxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmNcbiAqIEByZXR1cm5zIHtTdHJpbmd9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmdW5jdGlvblRvSW5zdGFudFN0cmluZyhmdW5jKSB7XG5cdHJldHVybiAnKCcgKyBmdW5jLnRvU3RyaW5nKCkgKyAnKSgpOyc7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhbiBhcnJheSBvZiBmdW5jdGlvbnMuXG4gKiBVc2VmdWwgb25seSBpZiB0aGUgZnVuY3Rpb25zIGFyZSBuYW1lZC5cbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9uW119IGFycmF5IC0gQXJyYXkgb2YgZnVuY3Rpb25zXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RyaW5naWZ5RnVuY3Rpb25MaXN0KGFycmF5KSB7XG5cdHJldHVybiBhcnJheS5yZWR1Y2UoKHByZXYsIG5leHQpID0+IHByZXYgKyBuZXh0LnRvU3RyaW5nKCkgKyAnOycsICcnKTtcbn1cblxuLyoqXG4gKiBObyBvcGVyYXRpb25cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vb3AoKSB7XG59XG5cbi8qKlxuICogU2ltcGxlIGdldCByZXF1ZXN0LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7RnVuY3Rpb259IHN1Y2Nlc3NcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldCh1cmwsIHN1Y2Nlc3MpIHtcblx0Y29uc3QgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cblx0eGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9ICgpID0+IHtcblx0XHRpZiAoeGhyLnJlYWR5U3RhdGUgPT09IDQgJiYgeGhyLnN0YXR1cyA9PT0gMjAwKSB7XG5cdFx0XHRzdWNjZXNzKHhoci5yZXNwb25zZVRleHQpXG5cdFx0fVxuXHR9O1xuXHR4aHIub3BlbignR0VUJywgdXJsLCB0cnVlKTtcblx0eGhyLnNlbmQoKTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxuY29uc3QgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbCcpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHV0aWwuZnVuY3Rpb25Ub0luc3RhbnRTdHJpbmcoZnVuY3Rpb24gKCkge1xuXG5cdChmdW5jdGlvbiAoKSB7XG5cdFx0J3VzZSBzdHJpY3QnO1xuXG5cdFx0bGV0IGN1cnJlbnRQb3N0O1xuXG5cdFx0ZnVuY3Rpb24gX3NlbmRQb3N0KCkge1xuXHRcdFx0bGV0IGFyZ3MgICAgICAgICA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cdFx0XHRjdXJyZW50UG9zdC5kb25lID0gYXJncy5zaGlmdCgpO1xuXHRcdFx0YXJncy5wdXNoKGN1cnJlbnRQb3N0KTtcblx0XHRcdHBvc3RNZXNzYWdlKGFyZ3MpO1xuXHRcdH1cblxuXHRcdHNlbGYucmV0dXJuID0gX3NlbmRQb3N0LmJpbmQodGhpcywgdHJ1ZSk7XG5cdFx0c2VsZi5wb3N0ICAgPSBfc2VuZFBvc3QuYmluZCh0aGlzLCBmYWxzZSk7XG5cblx0XHRzZWxmLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZSkge1xuXHRcdFx0Y3VycmVudFBvc3QgPSBlLmRhdGEucG9wKCk7XG5cdFx0XHRzZWxmLnJlY2VpdmUuYXBwbHkoZSwgZS5kYXRhKTtcblx0XHR9LCBmYWxzZSk7XG5cdH0oKSk7XG5cblx0J19fTXVsdGlXb3JrZXJfcGxhY2Vob2xkZXJfXyc7XG59KTtcbiJdfQ==
