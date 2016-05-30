(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var count = 0;

var Post = function Post() {
	_classCallCheck(this, Post);

	this.id = count++;
	this.done = false; // This flag is set to true by the worker when it has finished its task
};

module.exports = Post;

},{}],2:[function(require,module,exports){
'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var MultiWorkerMessage = function MultiWorkerMessage(instance, post, event) {
	_classCallCheck(this, MultiWorkerMessage);

	this.event = event;
	this.done = !!post.done;
	this.instance = instance;
};

module.exports = MultiWorkerMessage;

},{}],3:[function(require,module,exports){
'use strict';

window.MultiWorker = require('./index');

},{"./index":4}],4:[function(require,module,exports){
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var util = require('./util');
var Post = require('./Post');
var WorkerMessage = require('./WorkerMessage');
var workerString = require('./workerString');

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

},{"./Post":1,"./WorkerMessage":2,"./util":5,"./workerString":6}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
'use strict';

var util = require('./util');

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

},{"./util":5}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvUG9zdC5qcyIsInNyYy9Xb3JrZXJNZXNzYWdlLmpzIiwic3JjL2J1aWxkLmpzIiwic3JjL2luZGV4LmpzIiwic3JjL3V0aWwuanMiLCJzcmMvd29ya2VyU3RyaW5nLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7Ozs7QUFFQSxJQUFJLFFBQVEsQ0FBWjs7SUFFTSxJLEdBQ0wsZ0JBQWM7QUFBQTs7QUFDYixNQUFLLEVBQUwsR0FBWSxPQUFaO0FBQ0EsTUFBSyxJQUFMLEdBQVksS0FBWixDO0FBQ0EsQzs7QUFHRixPQUFPLE9BQVAsR0FBaUIsSUFBakI7OztBQ1hBOzs7O0lBRU0sa0IsR0FDTCw0QkFBWSxRQUFaLEVBQXNCLElBQXRCLEVBQTRCLEtBQTVCLEVBQW1DO0FBQUE7O0FBQ2xDLE1BQUssS0FBTCxHQUFnQixLQUFoQjtBQUNBLE1BQUssSUFBTCxHQUFnQixDQUFDLENBQUMsS0FBSyxJQUF2QjtBQUNBLE1BQUssUUFBTCxHQUFnQixRQUFoQjtBQUNBLEM7O0FBR0YsT0FBTyxPQUFQLEdBQWlCLGtCQUFqQjs7O0FDVkE7O0FBRUEsT0FBTyxXQUFQLEdBQXFCLFFBQVEsU0FBUixDQUFyQjs7O0FDRkE7Ozs7OztBQUVBLElBQU0sT0FBZ0IsUUFBUSxRQUFSLENBQXRCO0FBQ0EsSUFBTSxPQUFnQixRQUFRLFFBQVIsQ0FBdEI7QUFDQSxJQUFNLGdCQUFnQixRQUFRLGlCQUFSLENBQXRCO0FBQ0EsSUFBTSxlQUFnQixRQUFRLGdCQUFSLENBQXRCOztBQUVBLElBQU0sZ0JBQWdCLElBQUksT0FBSixFQUF0Qjs7SUFFTSxXOzs7Ozs7Ozs7QUFRTCxzQkFBWSxPQUFaLEVBQXFCO0FBQUE7O0FBQUE7Ozs7QUFJcEIsTUFBSSxTQUFVLFFBQVEsTUFBUixLQUFtQixTQUFwQixHQUFpQyxRQUFRLE1BQXpDLEdBQWtELE9BQS9EOztBQUVBLE1BQUksT0FBTyxNQUFQLEtBQWtCLFFBQXRCLEVBQWdDO0FBQy9CLFFBQUssR0FBTCxDQUFTLE1BQVQsRUFBaUIsZ0JBQVE7QUFDeEIsVUFBSyxNQUFMLEdBQWMsSUFBZDtBQUNBLFVBQUssS0FBTDtBQUNBLElBSEQ7QUFJQSxHQUxELE1BS08sSUFBSSxPQUFPLE1BQVAsS0FBa0IsVUFBdEIsRUFBa0M7QUFDeEMsUUFBSyxNQUFMLEdBQWMsS0FBSyx1QkFBTCxDQUE2QixNQUE3QixDQUFkO0FBQ0E7Ozs7QUFJRCxPQUFLLFFBQUwsR0FBb0IsUUFBUSxRQUFSLElBQW9CLEtBQUssSUFBN0M7QUFDQSxPQUFLLE9BQUwsR0FBb0IsUUFBUSxPQUFSLElBQW1CLENBQXZDO0FBQ0EsT0FBSyxZQUFMLEdBQW9CLFFBQVEsWUFBUixJQUF3QixFQUE1Qzs7OztBQUlBLE9BQUssZUFBTDs7OztBQUlBLE1BQUksS0FBSyxNQUFULEVBQWlCLEtBQUssS0FBTDtBQUNqQjs7Ozs7Ozs7Ozs7Ozs7eUJBVU07QUFDTixPQUFJLE9BQU8sTUFBTSxTQUFOLENBQWdCLEtBQWhCLENBQXNCLElBQXRCLENBQTJCLFNBQTNCLENBQVg7T0FDQyxLQUFPLE9BQU8sS0FBSyxLQUFLLE1BQUwsR0FBYyxDQUFuQixDQUFQLEtBQWlDLFVBQWpDLEdBQThDLEtBQUssR0FBTCxFQUE5QyxHQUEyRCxLQUFLLFFBRHhFOztBQUdBLFFBQUssUUFBTCxDQUFjLElBQWQsRUFBb0IsRUFBcEI7O0FBRUEsVUFBTyxJQUFQO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzhCQTBCb0M7QUFBQSxPQUEzQixPQUEyQix5REFBakIsS0FBaUI7QUFBQSxPQUFWLFFBQVU7O0FBQ3BDLE9BQUksT0FBTyxPQUFQLEtBQW1CLFVBQXZCLEVBQW1DO0FBQ2xDLGVBQVcsT0FBWDtBQUNBLGNBQVcsS0FBWDtBQUNBOztBQUVELE9BQUksV0FBWSxLQUFLLEtBQUwsSUFBYyxDQUFDLEtBQUssWUFBcEMsRUFBbUQ7QUFDbEQsU0FBSyxVQUFMLENBQWdCLE9BQWhCLENBQXdCO0FBQUEsWUFBVSxPQUFPLFNBQVAsRUFBVjtBQUFBLEtBQXhCO0FBQ0EsU0FBSyxlQUFMO0FBQ0EsU0FBSyxPQUFMLEdBQWUsQ0FBZjtBQUNBLFdBQU8sS0FBSyxpQkFBWjtBQUNBLFFBQUksT0FBTyxRQUFQLEtBQW9CLFVBQXhCLEVBQW9DO0FBQ3BDLElBTkQsTUFNTztBQUNOLFNBQUssaUJBQUwsR0FBeUIsWUFBWSxJQUFyQztBQUNBO0FBQ0QsVUFBTyxJQUFQO0FBQ0E7OzswQkFFTztBQUNQLFFBQUssS0FBTCxHQUFhLElBQWI7QUFDQSxRQUFLLFlBQUw7QUFDQSxRQUFLLGFBQUw7QUFDQTs7OzJCQUVRLEksRUFBTSxFLEVBQUk7QUFDbEIsT0FBSSxTQUFTLEtBQUssZ0JBQWxCO09BQ0MsT0FBUyxJQUFJLElBQUosRUFEVjs7QUFHQSxRQUFLLElBQUwsQ0FBVSxJQUFWOztBQUVBLE9BQUksS0FBSyxLQUFMLElBQWMsTUFBbEIsRUFBMEI7QUFDekIsU0FBSyxlQUFMLENBQXFCLEtBQUssRUFBMUIsSUFBZ0M7QUFDL0IsV0FEK0I7QUFFL0I7QUFGK0IsS0FBaEM7O0FBS0EsV0FBTyxXQUFQLENBQW1CLElBQW5CO0FBQ0Esa0JBQWMsR0FBZCxDQUFrQixNQUFsQixFQUEwQixJQUExQjtBQUNBLFNBQUssWUFBTDtBQUNBLElBVEQsTUFTTztBQUNOLFNBQUssS0FBTCxDQUFXLElBQVgsQ0FBZ0IsQ0FBQyxJQUFELEVBQU8sRUFBUCxDQUFoQjtBQUNBO0FBQ0Q7OztvQ0FFaUI7QUFDakIsUUFBSyxLQUFMLEdBQXVCLEtBQXZCO0FBQ0EsUUFBSyxVQUFMLEdBQXVCLEVBQXZCO0FBQ0EsUUFBSyxLQUFMLEdBQXVCLEVBQXZCO0FBQ0EsUUFBSyxZQUFMLEdBQXVCLENBQXZCO0FBQ0EsUUFBSyxlQUFMLEdBQXVCLEVBQXZCO0FBQ0E7OztpQ0FFYztBQUNkLE9BQUksSUFBSSxLQUFLLE9BQWI7QUFDQSxVQUFPLEdBQVAsRUFBWTtBQUNYLFFBQU0sU0FBUyxJQUFJLE1BQUosQ0FBVyxLQUFLLFFBQWhCLENBQWY7O0FBRUEsV0FBTyxnQkFBUCxDQUF3QixTQUF4QixFQUFtQyxLQUFLLFdBQUwsQ0FBaUIsb0JBQWpCLENBQXNDLElBQXRDLENBQTJDLElBQTNDLENBQW5DLEVBQXFGLEtBQXJGO0FBQ0EsU0FBSyxVQUFMLENBQWdCLElBQWhCLENBQXFCLE1BQXJCO0FBQ0E7QUFDRDs7Ozs7Ozs7Ozs7bUNBd0JnQixFLEVBQUk7QUFDcEIsUUFBSyxZQUFMO0FBQ0EsT0FBSSxTQUFTLEtBQUssZUFBTCxDQUFxQixFQUFyQixFQUF5QixNQUF0QztBQUNBLGlCQUFjLEdBQWQsQ0FBa0IsTUFBbEIsRUFBMEIsS0FBMUI7QUFDQSxVQUFPLEtBQUssZUFBTCxDQUFxQixFQUFyQixDQUFQO0FBQ0EsVUFBTyxJQUFQO0FBQ0E7OztrQ0FFZTtBQUNmLE9BQUksS0FBSyxLQUFMLENBQVcsTUFBWCxJQUFxQixLQUFLLFlBQUwsR0FBb0IsS0FBSyxPQUFsRCxFQUEyRDtBQUMxRCxRQUFJLGNBQWMsS0FBSyxLQUFMLENBQVcsS0FBWCxFQUFsQjtBQUNBLFNBQUssUUFBTCxDQUFjLEtBQWQsQ0FBb0IsSUFBcEIsRUFBMEIsV0FBMUI7QUFDQSxTQUFLLGFBQUw7QUFDQSxJQUpELE1BSU8sSUFBSSxLQUFLLGlCQUFMLElBQTBCLENBQUMsS0FBSyxZQUFwQyxFQUFrRDtBQUN4RCxTQUFLLFNBQUwsQ0FBZSxJQUFmLEVBQXFCLEtBQUssaUJBQTFCO0FBQ0E7QUFDRCxVQUFPLElBQVA7QUFDQTs7Ozs7Ozs7Ozs7c0JBUXNCO0FBQ3RCLE9BQU0sT0FBTyxLQUFLLFVBQWxCO0FBQ0EsUUFBSyxJQUFJLElBQUksQ0FBUixFQUFXLE1BQU0sS0FBSyxNQUEzQixFQUFtQyxJQUFJLEdBQXZDLEVBQTRDLEdBQTVDLEVBQWlEO0FBQ2hELFFBQUksQ0FBQyxjQUFjLEdBQWQsQ0FBa0IsS0FBSyxDQUFMLENBQWxCLENBQUwsRUFBaUM7QUFDaEMsWUFBTyxLQUFLLENBQUwsQ0FBUDtBQUNBO0FBQ0Q7QUFDRCxVQUFPLEtBQVA7QUFDQTs7Ozs7Ozs7Ozs7c0JBUW1CO0FBQ25CLFVBQU8sYUFBYSxPQUFiLENBQXFCLGtDQUFyQixFQUF5RCxLQUFLLGlCQUFMLEdBQXlCLEtBQUssTUFBdkYsQ0FBUDtBQUNBOzs7Ozs7Ozs7OztzQkFRYztBQUNkLE9BQUksQ0FBQyxLQUFLLGNBQVYsRUFBMEI7QUFDekIsU0FBSyxjQUFMLEdBQXNCLE9BQU8sR0FBUCxDQUFXLGVBQVgsQ0FBMkIsSUFBSSxJQUFKLENBQVMsQ0FBQyxLQUFLLGFBQU4sQ0FBVCxFQUErQjtBQUMvRSxXQUFNO0FBRHlFLEtBQS9CLENBQTNCLENBQXRCO0FBR0E7QUFDRCxVQUFPLEtBQUssY0FBWjtBQUNBOzs7Ozs7Ozs7OztzQkFRdUI7QUFDdkIsVUFBTyxLQUFLLHFCQUFMLENBQTJCLEtBQUssWUFBaEMsQ0FBUDtBQUNBOzs7dUNBcEYyQixLLEVBQU87QUFDbEMsT0FBSSxPQUFVLE1BQU0sSUFBTixDQUFXLEdBQVgsRUFBZDtPQUNDLEtBQVUsS0FBSyxlQUFMLENBQXFCLEtBQUssRUFBMUIsRUFBOEIsRUFEekM7T0FFQyxVQUFVLElBQUksYUFBSixDQUFrQixJQUFsQixFQUF3QixJQUF4QixFQUE4QixLQUE5QixDQUZYOztBQUlBLE9BQUksS0FBSyxJQUFULEVBQWU7QUFDZCxTQUFLLGdCQUFMLENBQXNCLEtBQUssRUFBM0I7QUFDQTs7QUFFRCxNQUFHLEtBQUgsQ0FBUyxPQUFULEVBQWtCLE1BQU0sSUFBeEI7O0FBRUEsT0FBSSxLQUFLLElBQVQsRUFBZTtBQUNkLFNBQUssYUFBTDtBQUNBO0FBQ0Q7Ozs7OztBQXlFRixPQUFPLE9BQVAsR0FBaUIsV0FBakI7OztBQ25QQTs7Ozs7Ozs7Ozs7O1FBUWdCLHVCLEdBQUEsdUI7UUFXQSxxQixHQUFBLHFCO1FBT0EsSSxHQUFBLEk7UUFTQSxHLEdBQUEsRztBQTNCVCxTQUFTLHVCQUFULENBQWlDLElBQWpDLEVBQXVDO0FBQzdDLFNBQU8sTUFBTSxLQUFLLFFBQUwsRUFBTixHQUF3QixNQUEvQjtBQUNBOzs7Ozs7Ozs7QUFTTSxTQUFTLHFCQUFULENBQStCLEtBQS9CLEVBQXNDO0FBQzVDLFNBQU8sTUFBTSxNQUFOLENBQWEsVUFBQyxJQUFELEVBQU8sSUFBUDtBQUFBLFdBQWdCLE9BQU8sS0FBSyxRQUFMLEVBQVAsR0FBeUIsR0FBekM7QUFBQSxHQUFiLEVBQTJELEVBQTNELENBQVA7QUFDQTs7Ozs7QUFLTSxTQUFTLElBQVQsR0FBZ0IsQ0FDdEI7Ozs7Ozs7O0FBUU0sU0FBUyxHQUFULENBQWEsR0FBYixFQUFrQixPQUFsQixFQUEyQjtBQUNqQyxNQUFNLE1BQU0sSUFBSSxjQUFKLEVBQVo7O0FBRUEsTUFBSSxrQkFBSixHQUF5QixZQUFNO0FBQzlCLFFBQUksSUFBSSxVQUFKLEtBQW1CLENBQW5CLElBQXdCLElBQUksTUFBSixLQUFlLEdBQTNDLEVBQWdEO0FBQy9DLGNBQVEsSUFBSSxZQUFaO0FBQ0E7QUFDRCxHQUpEO0FBS0EsTUFBSSxJQUFKLENBQVMsS0FBVCxFQUFnQixHQUFoQixFQUFxQixJQUFyQjtBQUNBLE1BQUksSUFBSjtBQUNBOzs7QUM3Q0Q7O0FBRUEsSUFBTSxPQUFPLFFBQVEsUUFBUixDQUFiOztBQUVBLE9BQU8sT0FBUCxHQUFpQixLQUFLLHVCQUFMLENBQTZCLFlBQVk7O0FBRXhELGNBQVk7QUFDWjs7QUFFQSxNQUFJLG9CQUFKOztBQUVBLFdBQVMsU0FBVCxHQUFxQjtBQUNwQixPQUFJLE9BQWUsTUFBTSxTQUFOLENBQWdCLEtBQWhCLENBQXNCLElBQXRCLENBQTJCLFNBQTNCLENBQW5CO0FBQ0EsZUFBWSxJQUFaLEdBQW1CLEtBQUssS0FBTCxFQUFuQjtBQUNBLFFBQUssSUFBTCxDQUFVLFdBQVY7QUFDQSxlQUFZLElBQVo7QUFDQTs7QUFFRCxPQUFLLE1BQUwsR0FBYyxVQUFVLElBQVYsQ0FBZSxJQUFmLEVBQXFCLElBQXJCLENBQWQ7QUFDQSxPQUFLLElBQUwsR0FBYyxVQUFVLElBQVYsQ0FBZSxJQUFmLEVBQXFCLEtBQXJCLENBQWQ7O0FBRUEsT0FBSyxnQkFBTCxDQUFzQixTQUF0QixFQUFpQyxVQUFVLENBQVYsRUFBYTtBQUM3QyxpQkFBYyxFQUFFLElBQUYsQ0FBTyxHQUFQLEVBQWQ7QUFDQSxRQUFLLE9BQUwsQ0FBYSxLQUFiLENBQW1CLENBQW5CLEVBQXNCLEVBQUUsSUFBeEI7QUFDQSxHQUhELEVBR0csS0FISDtBQUlBLEVBbkJBLEdBQUQ7O0FBcUJBO0FBQ0EsQ0F4QmdCLENBQWpCIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIid1c2Ugc3RyaWN0JztcblxubGV0IGNvdW50ID0gMDtcblxuY2xhc3MgUG9zdCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuaWQgICA9IGNvdW50Kys7XG5cdFx0dGhpcy5kb25lID0gZmFsc2U7IC8vIFRoaXMgZmxhZyBpcyBzZXQgdG8gdHJ1ZSBieSB0aGUgd29ya2VyIHdoZW4gaXQgaGFzIGZpbmlzaGVkIGl0cyB0YXNrXG5cdH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBQb3N0O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5jbGFzcyBNdWx0aVdvcmtlck1lc3NhZ2Uge1xuXHRjb25zdHJ1Y3RvcihpbnN0YW5jZSwgcG9zdCwgZXZlbnQpIHtcblx0XHR0aGlzLmV2ZW50ICAgID0gZXZlbnQ7XG5cdFx0dGhpcy5kb25lICAgICA9ICEhcG9zdC5kb25lO1xuXHRcdHRoaXMuaW5zdGFuY2UgPSBpbnN0YW5jZTtcblx0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IE11bHRpV29ya2VyTWVzc2FnZTtcbiIsIid1c2Ugc3RyaWN0Jztcblxud2luZG93Lk11bHRpV29ya2VyID0gcmVxdWlyZSgnLi9pbmRleCcpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCB1dGlsICAgICAgICAgID0gcmVxdWlyZSgnLi91dGlsJyk7XG5jb25zdCBQb3N0ICAgICAgICAgID0gcmVxdWlyZSgnLi9Qb3N0Jyk7XG5jb25zdCBXb3JrZXJNZXNzYWdlID0gcmVxdWlyZSgnLi9Xb3JrZXJNZXNzYWdlJyk7XG5jb25zdCB3b3JrZXJTdHJpbmcgID0gcmVxdWlyZSgnLi93b3JrZXJTdHJpbmcnKTtcblxuY29uc3QgX2lzV29ya2VyQnVzeSA9IG5ldyBXZWFrTWFwKCk7XG5cbmNsYXNzIE11bHRpV29ya2VyIHtcblxuXHQvKipcblx0ICogQHBhcmFtIHtPYmplY3R8RnVuY3Rpb258U3RyaW5nfSBvcHRpb25zIC0gQW4gb2JqZWN0IG9mIG9wdGlvbnMsIG9yIHNpbXBseSBhIGZ1bmN0aW9uIG9yIFVSTCBzdHJpbmcgdG8gYSBKUyBmaWxlLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLmNhbGxiYWNrIC0gRGVmYXVsdCBjYWxsYmFjayB1c2VkIGZvciBhbGwgcmVzcG9uc2VzIGZyb20gd29ya2VycyB3aGVyZSBvbmUgaXMgbm90IHByb3ZpZGVkIHdpdGggdGhlIHBvc3QgbWV0aG9kLlxuXHQgKiBAcGFyYW0ge051bWJlcn0gW29wdGlvbnMudGhyZWFkcz0xXSAtIE51bWJlciBvZiB3b3JrZXJzIHRvIHNwYXduLlxuXHQgKiBAcGFyYW0ge0Z1bmN0aW9uW119IFtvcHRpb25zLmRlcGVuZGVuY2llc10gLSBBcnJheSBvZiBuYW1lZCBmdW5jdGlvbnMgdGhhdCBjYW4gYmUgdXNlZCBnbG9iYWxseSBpbiB0aGUgd29ya2Vycy4gVGhlc2UgZnVuY3Rpb25zIG11c3QgYmUgbmFtZWQgYW5kIG5vdCBtYWtlIHJlZmVyZW5jZXMgdG8gZGF0YSBvdXRzaWRlIHRoZSBmdW5jdGlvbiBzY29wZS5cblx0ICovXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcblxuXHRcdC8vIEdldCB0aGUgd29ya2VyIGNvZGVcblx0XHQvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0bGV0IHdvcmtlciA9IChvcHRpb25zLndvcmtlciAhPT0gdW5kZWZpbmVkKSA/IG9wdGlvbnMud29ya2VyIDogb3B0aW9ucztcblxuXHRcdGlmICh0eXBlb2Ygd29ya2VyID09PSAnc3RyaW5nJykge1xuXHRcdFx0dXRpbC5nZXQod29ya2VyLCB0ZXh0ID0+IHtcblx0XHRcdFx0dGhpcy53b3JrZXIgPSB0ZXh0O1xuXHRcdFx0XHR0aGlzLl9pbml0KCk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiB3b3JrZXIgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRoaXMud29ya2VyID0gdXRpbC5mdW5jdGlvblRvSW5zdGFudFN0cmluZyh3b3JrZXIpO1xuXHRcdH1cblxuXHRcdC8vIFNldCBwcm9wZXJ0aWVzIGZyb20gc2V0dGluZ3Ncblx0XHQvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0dGhpcy5jYWxsYmFjayAgICAgPSBvcHRpb25zLmNhbGxiYWNrIHx8IHV0aWwubm9vcDtcblx0XHR0aGlzLnRocmVhZHMgICAgICA9IG9wdGlvbnMudGhyZWFkcyB8fCAxO1xuXHRcdHRoaXMuZGVwZW5kZW5jaWVzID0gb3B0aW9ucy5kZXBlbmRlbmNpZXMgfHwgW107XG5cblx0XHQvLyBTZXQgZ2VuZXJpYyBwcm9wZXJ0aWVzXG5cdFx0Ly8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdHRoaXMuX2luaXRQcm9wZXJ0aWVzKCk7XG5cblx0XHQvLyBJbml0IGlmIHdvcmtlciBpcyBhdmFpbGFibGVcblx0XHQvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0aWYgKHRoaXMud29ya2VyKSB0aGlzLl9pbml0KCk7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZCBhIG1lc3NhZ2UgdG8gdGhlIE11bHRpV29ya2VyIGluc3RhbmNlLiBBY2NlcHRzIGFuIGFyYml0cmFyeSBudW1iZXIgb2YgYXJndW1lbnRzLCBmb2xsb3dlZCBieSBhbiBvcHRpb25hbFxuXHQgKiBjYWxsYmFjayB0byBkZWFsIHdpdGggdGhlIHJlc3BvbnNlIGZyb20gdGhlIHdvcmtlci5cblx0ICpcblx0ICogQHBhcmFtIHsuLi4qfSBhcmd1bWVudHNcblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2tcblx0ICogQHJldHVybnMge011bHRpV29ya2VyfVxuXHQgKi9cblx0cG9zdCgpIHtcblx0XHRsZXQgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyksXG5cdFx0XHRjYiAgID0gdHlwZW9mIGFyZ3NbYXJncy5sZW5ndGggLSAxXSA9PT0gJ2Z1bmN0aW9uJyA/IGFyZ3MucG9wKCkgOiB0aGlzLmNhbGxiYWNrO1xuXG5cdFx0dGhpcy5fcHJvY2VzcyhhcmdzLCBjYik7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXJtaW5hdGUgdGhlIGluc3RhbmNlLiBBbGwgd29ya2VycyBhc3NvY2lhdGVkIHdpdGggdGhlIGluc3RhbmNlIHdpbGwgYmUgdGVybWluYXRlZC4gT25jZSB0aGlzIG1ldGhvZCBpcyBjYWxsZWQsXG5cdCAqIHRoZSBpbnN0YW5jZSBjYW4gbm8gbG9uZ2VyIGJlIHVzZWQuXG5cdCAqXG5cdCAqIEJ5IGRlZmF1bHQsIGFsbCBjdXJyZW50IGFuZCBxdWV1ZWQgcHJvY2Vzc2VzIHdpbGwgZmluaXNoIGJlZm9yZSB0aGUgaW5zdGFuY2UgaXMgdGVybWluYXRlZCwgdW5sZXNzIHRydWUgaXMgcGFzc2VkXG5cdCAqIGFzIGZpcnN0IHBhcmFtZXRlci5cblx0ICpcblx0ICogSWYgYSBmdW5jdGlvbiBpcyBwYXNzZWQgYXMgdGhlIGZpcnN0IHBhcmFtZXRlciwgdGhlIGluc3RhbmNlIHdpbGwgd2FpdCB0byBjb21wbGV0ZSB0aGUgY3VycmVudCBxdWV1ZSwgYXMgcGVyXG5cdCAqIGRlZmF1bHQgYmVoYXZpb3VyLCB0aGVuIGV4ZWN1dGUgdGhlIGNhbGxiYWNrIG9uY2UgZmluaXNoZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSB7Qm9vbGVhbnxGdW5jdGlvbn0gW2luc3RhbnQ9ZmFsc2VdIC0gU2V0IHRvIHRydWUgdG8gdGVybWluYXRlIGltbWVkaWF0ZWx5LCBvciBwYXNzIGEgY2FsbGJhY2sgZnVuY3Rpb25cblx0ICogQHBhcmFtIHtmdW5jdGlvbn0gW2NhbGxiYWNrXVxuXHQgKiBAcmV0dXJucyB7TXVsdGlXb3JrZXJ9XG5cdCAqXG5cdCAqIEBlYW1wbGVcblx0ICogICAgICAgLy8gV2FpdCBmb3IgcG9zdCB0byByZXR1cm4sIHRoZW4gdGVybWluYXRlXG5cdCAqICAgICB3b3JrZXIucG9zdCgxMCkudGVybWluYXRlKCk7XG5cdCAqXG5cdCAqICAgICAvLyBXYWl0IGZvciBwb3N0IHRvIHJldHVybiwgdGhlbiB0ZXJtaW5hdGUgYW5kIHJ1biB0aGUgY2FsbGJhY2tcblx0ICogICAgIHdvcmtlci5wb3N0KDEwKS50ZXJtaW5hdGUoZnVuY3Rpb24oKSB7IGNvbnNvbGUubG9nKCdmb28nKSB9KTtcblx0ICpcblx0ICogICAgIC8vIFRlcm1pbmF0ZSBpbnN0YW50bHksIHdpdGhvdXQgd2FpdGluZyBmb3IgcmVzdWx0IGZyb20gcG9zdFxuXHQgKiAgICAgd29ya2VyLnBvc3QoMTApLnRlcm1pbmF0ZSh0cnVlKTtcblx0ICovXG5cdHRlcm1pbmF0ZShpbnN0YW50ID0gZmFsc2UsIGNhbGxiYWNrKSB7XG5cdFx0aWYgKHR5cGVvZiBpbnN0YW50ID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRjYWxsYmFjayA9IGluc3RhbnQ7XG5cdFx0XHRpbnN0YW50ICA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChpbnN0YW50IHx8ICh0aGlzLnJlYWR5ICYmICF0aGlzLnByb2Nlc3NDb3VudCkpIHtcblx0XHRcdHRoaXMud29ya2VyTGlzdC5mb3JFYWNoKHdvcmtlciA9PiB3b3JrZXIudGVybWluYXRlKCkpO1xuXHRcdFx0dGhpcy5faW5pdFByb3BlcnRpZXMoKTtcblx0XHRcdHRoaXMudGhyZWFkcyA9IDA7XG5cdFx0XHRkZWxldGUgdGhpcy50ZXJtaW5hdGVXaGVuRnJlZTtcblx0XHRcdGlmICh0eXBlb2YgY2FsbGJhY2sgPT09ICdmdW5jdGlvbicpIGNhbGxiYWNrKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGVybWluYXRlV2hlbkZyZWUgPSBjYWxsYmFjayB8fCB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdF9pbml0KCkge1xuXHRcdHRoaXMucmVhZHkgPSB0cnVlO1xuXHRcdHRoaXMuX2luaXRUaHJlYWRzKCk7XG5cdFx0dGhpcy5fcHJvY2Vzc1F1ZXVlKCk7XG5cdH1cblxuXHRfcHJvY2VzcyhhcmdzLCBjYikge1xuXHRcdGxldCB3b3JrZXIgPSB0aGlzLl9hdmFpbGFibGVXb3JrZXIsXG5cdFx0XHRwb3N0ICAgPSBuZXcgUG9zdCgpO1xuXG5cdFx0YXJncy5wdXNoKHBvc3QpO1xuXG5cdFx0aWYgKHRoaXMucmVhZHkgJiYgd29ya2VyKSB7XG5cdFx0XHR0aGlzLl9pblByb2dyZXNzRGF0YVtwb3N0LmlkXSA9IHtcblx0XHRcdFx0Y2IsXG5cdFx0XHRcdHdvcmtlclxuXHRcdFx0fTtcblxuXHRcdFx0d29ya2VyLnBvc3RNZXNzYWdlKGFyZ3MpO1xuXHRcdFx0X2lzV29ya2VyQnVzeS5zZXQod29ya2VyLCB0cnVlKTtcblx0XHRcdHRoaXMucHJvY2Vzc0NvdW50Kys7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucXVldWUucHVzaChbYXJncywgY2JdKTtcblx0XHR9XG5cdH1cblxuXHRfaW5pdFByb3BlcnRpZXMoKSB7XG5cdFx0dGhpcy5yZWFkeSAgICAgICAgICAgPSBmYWxzZTtcblx0XHR0aGlzLndvcmtlckxpc3QgICAgICA9IFtdO1xuXHRcdHRoaXMucXVldWUgICAgICAgICAgID0gW107XG5cdFx0dGhpcy5wcm9jZXNzQ291bnQgICAgPSAwO1xuXHRcdHRoaXMuX2luUHJvZ3Jlc3NEYXRhID0ge307XG5cdH1cblxuXHRfaW5pdFRocmVhZHMoKSB7XG5cdFx0bGV0IGkgPSB0aGlzLnRocmVhZHM7XG5cdFx0d2hpbGUgKGktLSkge1xuXHRcdFx0Y29uc3Qgd29ya2VyID0gbmV3IFdvcmtlcih0aGlzLl9ibG9iVXJsKTtcblxuXHRcdFx0d29ya2VyLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCB0aGlzLmNvbnN0cnVjdG9yLl9kZWZhdWx0TWVzc2FnZUV2ZW50LmJpbmQodGhpcyksIGZhbHNlKTtcblx0XHRcdHRoaXMud29ya2VyTGlzdC5wdXNoKHdvcmtlcik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBkZWZhdWx0IGV2ZW50IGZ1bmN0aW9uIHVzZWQgaW50ZXJuYWxseSB0byBoYW5kbGUgbWVzc2FnZXMgY29taW5nIGZyb20gdGhlIHdvcmtlcnMuXG5cdCAqXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSBldmVudFxuXHQgKi9cblx0c3RhdGljIF9kZWZhdWx0TWVzc2FnZUV2ZW50KGV2ZW50KSB7XG5cdFx0bGV0IHBvc3QgICAgPSBldmVudC5kYXRhLnBvcCgpLFxuXHRcdFx0Y2IgICAgICA9IHRoaXMuX2luUHJvZ3Jlc3NEYXRhW3Bvc3QuaWRdLmNiLFxuXHRcdFx0Y29udGV4dCA9IG5ldyBXb3JrZXJNZXNzYWdlKHRoaXMsIHBvc3QsIGV2ZW50KTtcblxuXHRcdGlmIChwb3N0LmRvbmUpIHtcblx0XHRcdHRoaXMuX3Byb2Nlc3NGaW5pc2hlZChwb3N0LmlkKTtcblx0XHR9XG5cblx0XHRjYi5hcHBseShjb250ZXh0LCBldmVudC5kYXRhKTtcblxuXHRcdGlmIChwb3N0LmRvbmUpIHtcblx0XHRcdHRoaXMuX3Byb2Nlc3NRdWV1ZSgpO1xuXHRcdH1cblx0fVxuXG5cdF9wcm9jZXNzRmluaXNoZWQoaWQpIHtcblx0XHR0aGlzLnByb2Nlc3NDb3VudC0tO1xuXHRcdGxldCB3b3JrZXIgPSB0aGlzLl9pblByb2dyZXNzRGF0YVtpZF0ud29ya2VyO1xuXHRcdF9pc1dvcmtlckJ1c3kuc2V0KHdvcmtlciwgZmFsc2UpO1xuXHRcdGRlbGV0ZSB0aGlzLl9pblByb2dyZXNzRGF0YVtpZF07XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRfcHJvY2Vzc1F1ZXVlKCkge1xuXHRcdGlmICh0aGlzLnF1ZXVlLmxlbmd0aCAmJiB0aGlzLnByb2Nlc3NDb3VudCA8IHRoaXMudGhyZWFkcykge1xuXHRcdFx0bGV0IG5leHRQcm9jZXNzID0gdGhpcy5xdWV1ZS5zaGlmdCgpO1xuXHRcdFx0dGhpcy5fcHJvY2Vzcy5hcHBseSh0aGlzLCBuZXh0UHJvY2Vzcyk7XG5cdFx0XHR0aGlzLl9wcm9jZXNzUXVldWUoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMudGVybWluYXRlV2hlbkZyZWUgJiYgIXRoaXMucHJvY2Vzc0NvdW50KSB7XG5cdFx0XHR0aGlzLnRlcm1pbmF0ZSh0cnVlLCB0aGlzLnRlcm1pbmF0ZVdoZW5GcmVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIGZpcnN0IGZyZWUgd29ya2VyIG9yIGZhbHNlXG5cdCAqXG5cdCAqIEBwcml2YXRlXG5cdCAqIEByZXR1cm5zIHtXb3JrZXJ8Qm9vbGVhbn1cblx0ICovXG5cdGdldCBfYXZhaWxhYmxlV29ya2VyKCkge1xuXHRcdGNvbnN0IGxpc3QgPSB0aGlzLndvcmtlckxpc3Q7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpc3QubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmICghX2lzV29ya2VyQnVzeS5nZXQobGlzdFtpXSkpIHtcblx0XHRcdFx0cmV0dXJuIGxpc3RbaV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gdGhlIGZ1bGwgd29ya2VyIEphdmFTY3JpcHQgY29kZSB0byBiZSBydW4gaW5zaWRlIHRoZSB3b3JrZXIgYXMgYSBzdHJpbmcuXG5cdCAqXG5cdCAqIEBwcml2YXRlXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9XG5cdCAqL1xuXHRnZXQgX3dvcmtlclN0cmluZygpIHtcblx0XHRyZXR1cm4gd29ya2VyU3RyaW5nLnJlcGxhY2UoJ1xcJ19fTXVsdGlXb3JrZXJfcGxhY2Vob2xkZXJfX1xcJzsnLCB0aGlzLl9kZXBlbmRlbmN5U3RyaW5nICsgdGhpcy53b3JrZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdlbmVyYXRlIGFuZCByZXR1cm4gYSBibG9iVXJsIFVSTCB0byBiZSB1c2VkIGJ5IHRoZSB3b3JrZXJzLlxuXHQgKlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfVxuXHQgKi9cblx0Z2V0IF9ibG9iVXJsKCkge1xuXHRcdGlmICghdGhpcy5fYmxvYlVybENhY2hlZCkge1xuXHRcdFx0dGhpcy5fYmxvYlVybENhY2hlZCA9IHdpbmRvdy5VUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFt0aGlzLl93b3JrZXJTdHJpbmddLCB7XG5cdFx0XHRcdHR5cGU6ICdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0J1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYmxvYlVybENhY2hlZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gYSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIGluc3RhbmNlJ3MgZGVwZW5kZW5jeSBmdW5jdGlvbnMgdG8gYmUgYWRkZWQgdG8gdGhlIHdvcmtlciBjb2RlIHN0cmluZy5cblx0ICpcblx0ICogQHByaXZhdGVcblx0ICogQHJldHVybnMge1N0cmluZ31cblx0ICovXG5cdGdldCBfZGVwZW5kZW5jeVN0cmluZygpIHtcblx0XHRyZXR1cm4gdXRpbC5zdHJpbmdpZnlGdW5jdGlvbkxpc3QodGhpcy5kZXBlbmRlbmNpZXMpO1xuXHR9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gTXVsdGlXb3JrZXI7XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogUmV0dXJucyBhIHNlbGYtaW52b2tpbmcsIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIGZ1bmN0aW9uXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuY1xuICogQHJldHVybnMge1N0cmluZ31cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZ1bmN0aW9uVG9JbnN0YW50U3RyaW5nKGZ1bmMpIHtcblx0cmV0dXJuICcoJyArIGZ1bmMudG9TdHJpbmcoKSArICcpKCk7Jztcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGFuIGFycmF5IG9mIGZ1bmN0aW9ucy5cbiAqIFVzZWZ1bCBvbmx5IGlmIHRoZSBmdW5jdGlvbnMgYXJlIG5hbWVkLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb25bXX0gYXJyYXkgLSBBcnJheSBvZiBmdW5jdGlvbnNcbiAqIEByZXR1cm5zIHtTdHJpbmd9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdHJpbmdpZnlGdW5jdGlvbkxpc3QoYXJyYXkpIHtcblx0cmV0dXJuIGFycmF5LnJlZHVjZSgocHJldiwgbmV4dCkgPT4gcHJldiArIG5leHQudG9TdHJpbmcoKSArICc7JywgJycpO1xufVxuXG4vKipcbiAqIE5vIG9wZXJhdGlvblxuICovXG5leHBvcnQgZnVuY3Rpb24gbm9vcCgpIHtcbn1cblxuLyoqXG4gKiBTaW1wbGUgZ2V0IHJlcXVlc3QuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtGdW5jdGlvbn0gc3VjY2Vzc1xuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0KHVybCwgc3VjY2Vzcykge1xuXHRjb25zdCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblxuXHR4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gKCkgPT4ge1xuXHRcdGlmICh4aHIucmVhZHlTdGF0ZSA9PT0gNCAmJiB4aHIuc3RhdHVzID09PSAyMDApIHtcblx0XHRcdHN1Y2Nlc3MoeGhyLnJlc3BvbnNlVGV4dClcblx0XHR9XG5cdH07XG5cdHhoci5vcGVuKCdHRVQnLCB1cmwsIHRydWUpO1xuXHR4aHIuc2VuZCgpO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5jb25zdCB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gdXRpbC5mdW5jdGlvblRvSW5zdGFudFN0cmluZyhmdW5jdGlvbiAoKSB7XG5cblx0KGZ1bmN0aW9uICgpIHtcblx0XHQndXNlIHN0cmljdCc7XG5cblx0XHRsZXQgY3VycmVudFBvc3Q7XG5cblx0XHRmdW5jdGlvbiBfc2VuZFBvc3QoKSB7XG5cdFx0XHRsZXQgYXJncyAgICAgICAgID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRcdGN1cnJlbnRQb3N0LmRvbmUgPSBhcmdzLnNoaWZ0KCk7XG5cdFx0XHRhcmdzLnB1c2goY3VycmVudFBvc3QpO1xuXHRcdFx0cG9zdE1lc3NhZ2UoYXJncyk7XG5cdFx0fVxuXG5cdFx0c2VsZi5yZXR1cm4gPSBfc2VuZFBvc3QuYmluZCh0aGlzLCB0cnVlKTtcblx0XHRzZWxmLnBvc3QgICA9IF9zZW5kUG9zdC5iaW5kKHRoaXMsIGZhbHNlKTtcblxuXHRcdHNlbGYuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChlKSB7XG5cdFx0XHRjdXJyZW50UG9zdCA9IGUuZGF0YS5wb3AoKTtcblx0XHRcdHNlbGYucmVjZWl2ZS5hcHBseShlLCBlLmRhdGEpO1xuXHRcdH0sIGZhbHNlKTtcblx0fSgpKTtcblxuXHQnX19NdWx0aVdvcmtlcl9wbGFjZWhvbGRlcl9fJztcbn0pO1xuIl19
