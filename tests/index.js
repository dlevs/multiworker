'use strict';

function simpleReturn() {
	self.receive = self.return;
}

describe('Worker functionality', function () {
	describe('Basic setup', function () {
		it('app variable is a function', function () {
			window.MultiWorker.should.be.a('function')
		});
	});

	describe('Class works when...', function () {
		it('...passing only a function to constructor', function (next) {
			var worker = new MultiWorker(simpleReturn);

			worker
				.post(function () {
					next();
				})
				.terminate();
		});

		it('...passing only a url to constructor', function (next) {
			var worker = new MultiWorker('worker.js');

			worker
				.post('blah', function (a) {
					a.should.equal('blah');
					next();
				})
				.terminate();
		});

		it('...passing an options object to constructor with a worker function', function (next) {
			var worker = new MultiWorker({
				worker: simpleReturn
			});

			worker
				.post(function () {
					next();
				})
				.terminate();
		});

		it('...passing an options object to constructor with a worker url', function (next) {
			var worker = new MultiWorker({
				worker: 'worker.js'
			});

			worker
				.post('blah', function (a) {
					a.should.equal('blah');
					next();
				})
				.terminate();
		});
	});

	describe('Methods', function () {
		it('return method works', function (next) {
			var worker = new MultiWorker(simpleReturn);

			worker
				.post(function () {
					worker.queue.length.should.equal(4);
					this.done.should.equal(true);
				})
				.post()
				.post()
				.post(function () {
					worker.queue.length.should.equal(1);
					this.done.should.equal(true);
				})
				.post(function () {
					worker.queue.length.should.equal(0);
					this.done.should.equal(true);
					next();
				})
				.terminate();

			worker.queue.length.should.equal(4);
		});

		it('post method works', function (next) {
			var worker = new MultiWorker(function () {
				self.receive = function (finish) {
					if (finish) {
						self.return('Instant return');
					} else {
						for (var i = 1; i < 11; i++) {
							if (i !== 10) {
								self.post(i);
							} else {
								self.return(i);
							}
						}
					}
				}
			});

			var count = 0;

			// First post will count to 10, and then run second post
			worker
				.post(function (n) {
					if (n === 10) {
						this.done.should.equal(true);
					} else {
						this.done.should.equal(false);
						n.should.equal(++count);
						worker.queue.length.should.equal(1);
					}
				})
				.post(true, function (result) {
					this.done.should.equal(true);
					worker.queue.length.should.equal(0);
					result.should.equal('Instant return');
					next();
				})
				.terminate();
		});

		describe('terminate method works', function () {
			it('basic functionality works', function () {
				var worker = new MultiWorker({
					worker:  simpleReturn,
					threads: 2
				});

				worker.workerList.length.should.equal(2);
				worker.workerList[0].should.be.instanceof(Worker);

				worker.terminate();

				worker.workerList.length.should.equal(0);
				expect(worker.workerList[0]).to.be.undefined;
			});

			it('will wait until all processes end to terminate, then run callback', function (next) {
				var worker = new MultiWorker(simpleReturn);

				worker
					.post()
					.post()
					.post(function () {
						worker.workerList.length.should.equal(1);
					})
					.terminate(function () {
						worker.workerList.length.should.equal(0);
						expect(worker.workerList[0]).to.be.undefined;
						next();
					});

				worker.workerList.length.should.equal(1);
			});

			it('will terminate instantly if true is passed', function (next) {
				var worker = new MultiWorker(function () {
					self.receive = self.return;
				});

				worker
					.post(function () {
						// An invalid test which will fail if terminate doens't work
						'foo bar'.should.equal(2);
					})
					.terminate(true);

				worker.workerList.length.should.equal(0);
				expect(worker.workerList[0]).to.be.undefined;
				next();
			});

			it('works for workers spawned from URL', function (next) {
				// This async process could lead to issues if terminating early or forgetting to terminate
				var worker = new MultiWorker('worker.js');

				worker
					.post(function () {
						worker.queue.length.should.equal(1);
					})
					.post()
					.terminate(function () {
						worker.workerList.length.should.equal(0);
						expect(worker.workerList[0]).to.be.undefined;
						next();
					});
			});

			it('invoking terminate method inside callback is ok', function (next) {
				// If internal processes happen in wrong order, this can lead to undefined type errors in console.
				var worker = new MultiWorker({
					worker:   simpleReturn,
					callback: function () {
						worker.terminate();
						next();
					}
				});

				worker.post();
			});

		});
	});

	describe('Queing and concurrency', function () {
		it('should delegate tasks to free workers', function (next) {
			var results = [],
				worker  = new MultiWorker({
					worker:   function () {
						function calculate(n) {
							var result = 0;
							for (var i = 0; i < n; i++) {
								result += i + 1;
							}
							return result;
						}

						self.receive = function (n) {
							self.return(calculate(n));
						}
					},
					threads:  4,
					callback: function (n) {
						results.push(n);
						if (!worker.processCount) {
							results.length.should.equal(4);
							results[0].should.equal(6);
							next();
						}
					}
				});

			worker.post(100000000)
				.post(100000000)
				.post(100000000)
				.post(3)
				.terminate();
		});
	});

	describe('Parameter passing', function () {
		it('All paramaters being passed to/from workers correctly', function (next) {
			var time   = new Date(),
				worker = new MultiWorker(simpleReturn);

			worker
				.post(1, [], [0, 20], {}, 'foo', time, function (a, b, c, d, e, f) {
					arguments.length.should.equal(6);

					a.should.equal(1);

					b.should.be.empty;
					b.should.be.an('array');

					c.length.should.equal(2);
					c[0].should.equal(0);
					c[1].should.equal(20);

					d.should.be.empty;
					d.should.be.an('object');

					e.should.equal('foo');

					f.valueOf().should.equal(time.valueOf());

					next();
				})
				.terminate();
		});

		it('passing no paramaters is legal', function (next) {
			var worker = new MultiWorker({
				worker:   simpleReturn,
				callback: function () {
					arguments.length.should.equal(0);
					next();
				}
			});

			worker.post().terminate();
		});

		it('passing only a callback is legal', function (next) {
			var worker = new MultiWorker(simpleReturn);

			worker
				.post(function () {
					arguments.length.should.equal(0);
					next();
				})
				.terminate();
		});
	});

	describe('Dependencies option', function () {
		it('works', function (next) {
			var worker = new MultiWorker({
				worker:       function () {
					self.receive = function (n1, n2) {
						self.return(add(n1, n2) + return1());
					}
				},
				dependencies: [
					function return1() {
						return 1
					},
					function add(n1, n2) {
						return n1 + n2;
					}
				]
			});

			worker
				.post(4, 5, function (n) {
					n.should.equal(10);
					next();
				})
				.terminate();
		});
	});
});