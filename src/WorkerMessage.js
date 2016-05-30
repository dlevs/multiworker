'use strict';

class MultiWorkerMessage {
	constructor(instance, post, event) {
		this.event    = event;
		this.done     = !!post.done;
		this.instance = instance;
	}
}

module.exports = MultiWorkerMessage;
