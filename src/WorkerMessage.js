class MultiWorkerMessage {
  constructor(instance, post, event) {
    this.event = event;
    this.done = !!post.done;
    this.instance = instance;
  }
}

export default MultiWorkerMessage;
