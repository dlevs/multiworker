export default `(function () {
  (function () {
    let currentPost;

    function _sendPost() {
      let args = Array.prototype.slice.call(arguments);
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
  }());

  '__MultiWorker_placeholder__';
})();`;
