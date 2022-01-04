export default `(function () {
  (function () {
    let currentPost;

    function _sendPost() {
      let args = Array.prototype.slice.call(arguments);
      currentPost.done = args.shift();
      const transfers = Array.isArray(args[args.length - 1]) ? args.pop() : undefined;
      postMessage({args: args, post: currentPost}, transfers);
    }

    self.return = _sendPost.bind(this, true);
    self.post = _sendPost.bind(this, false);

    self.addEventListener('message', function (e) {
      currentPost = e.data.post;
      self.receive.apply(e, e.data.args);
    }, false);
  }());

  '__MultiWorker_placeholder__';
})();`;
