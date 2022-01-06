let count = 0;

class Post {
  constructor() {
    this.id = count++;
    this.done = false; // This flag is set to true by the worker when it has finished its task
  }
}

export default Post;
