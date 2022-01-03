/* eslint-env mocha */
import { expect, should } from 'chai';
import MultiWorker from '../src/index.js';
import Worker from 'web-worker';

should();

function simpleReturn() {
  globalThis.receive = globalThis.return;
}

describe('Worker functionality', () => {
  describe('Basic setup', () => {
    it('app variable is a function', () => {
      MultiWorker.should.be.a('function');
    });
  });

  describe('Class works when...', () => {
    it('...passing only a function to constructor', (next) => {
      const worker = new MultiWorker(simpleReturn);

      worker
        .post(() => {
          next();
        })
        .terminate();
    });

    it('...passing only a url to constructor', (next) => {
      const worker = new MultiWorker(new URL('./worker.js', import.meta.url).href);

      worker
        .post('blah', (a) => {
          a.should.equal('blah');
          next();
        })
        .terminate();
    });

    it('...passing an options object to constructor with a worker function', (next) => {
      const worker = new MultiWorker({
        worker: simpleReturn,
      });

      worker
        .post(() => {
          next();
        })
        .terminate();
    });

    it('...passing an options object to constructor with a worker url', (next) => {
      const worker = new MultiWorker({
        worker: new URL('./worker.js', import.meta.url).href,
      });

      worker
        .post('blah', (a) => {
          a.should.equal('blah');
          next();
        })
        .terminate();
    });
  });

  describe('Methods', () => {
    it('return method works', (next) => {
      const worker = new MultiWorker(simpleReturn);

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

    it('post method works', (next) => {
      const worker = new MultiWorker(() => {
        globalThis.receive = function (finish) {
          if (finish) {
            globalThis.return('Instant return');
          } else {
            for (let i = 1; i < 11; i++) {
              if (i !== 10) {
                globalThis.post(i);
              } else {
                globalThis.return(i);
              }
            }
          }
        };
      });

      let count = 0;

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

    describe('terminate method works', () => {
      it('basic functionality works', () => {
        const worker = new MultiWorker({
          worker: simpleReturn,
          threads: 2,
        });

        worker.workerList.length.should.equal(2);
        worker.workerList[0].should.be.instanceof(Worker);

        worker.terminate();

        worker.workerList.length.should.equal(0);
        expect(worker.workerList[0]).to.be.undefined;
      });

      it('will wait until all processes end to terminate, then run callback', (next) => {
        const worker = new MultiWorker(simpleReturn);

        worker
          .post()
          .post()
          .post(() => {
            worker.workerList.length.should.equal(1);
          })
          .terminate(() => {
            worker.workerList.length.should.equal(0);
            expect(worker.workerList[0]).to.be.undefined;
            next();
          });

        worker.workerList.length.should.equal(1);
      });

      it('will terminate instantly if true is passed', (next) => {
        const worker = new MultiWorker(() => {
          self.receive = self.return;
        });

        worker
          .post(() => {
            // An invalid test which will fail if terminate doens't work
            'foo bar'.should.equal(2);
          })
          .terminate(true);

        worker.workerList.length.should.equal(0);
        expect(worker.workerList[0]).to.be.undefined;
        next();
      });

      it('works for workers spawned from URL', (next) => {
        // This async process could lead to issues if terminating early or forgetting to terminate
        const worker = new MultiWorker(new URL('./worker.js', import.meta.url).href);

        worker
          .post(() => {
            worker.queue.length.should.equal(1);
          })
          .post()
          .terminate(() => {
            worker.workerList.length.should.equal(0);
            expect(worker.workerList[0]).to.be.undefined;
            next();
          });
      });

      it('invoking terminate method inside callback is ok', (next) => {
        // If internal processes happen in wrong order, this can lead to undefined type errors in console.
        var worker = new MultiWorker({
          worker: simpleReturn,
          callback() {
            worker.terminate();
            next();
          },
        });

        worker.post();
      });
    });
  });

  describe('Queing and concurrency', () => {
    it('should delegate tasks to free workers', (next) => {
      const results = [];
      var worker = new MultiWorker({
        worker: () => {
          function calculate(n) {
            let result = 0;
            for (let i = 0; i < n; i++) {
              result += i + 1;
            }
            return result;
          }

          self.receive = function (n) {
            self.return(calculate(n));
          };
        },
        threads: 4,
        callback(n) {
          results.push(n);
          if (!worker.processCount) {
            results.length.should.equal(4);
            results[0].should.equal(6);
            next();
          }
        },
      });

      worker.post(100000000)
        .post(100000000)
        .post(100000000)
        .post(3)
        .terminate();
    });
  });

  describe('Parameter passing', () => {
    it('All paramaters being passed to/from workers correctly', (next) => {
      const time = new Date();
      const worker = new MultiWorker(simpleReturn);

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

    it('passing no paramaters is legal', (next) => {
      const worker = new MultiWorker({
        worker: simpleReturn,
        callback() {
          arguments.length.should.equal(0);
          next();
        },
      });

      worker.post().terminate();
    });

    it('passing only a callback is legal', (next) => {
      const worker = new MultiWorker(simpleReturn);

      worker
        .post(function () {
          arguments.length.should.equal(0);
          next();
        })
        .terminate();
    });
  });

  describe('Dependencies option', () => {
    it('works', (next) => {
      function return1() {
        return 1;
      }
      function add(n1, n2) {
        return n1 + n2;
      }
      const worker = new MultiWorker({
        worker: () => {
          self.receive = function (n1, n2) {
            self.return(add(n1, n2) + return1());
          };
        },
        dependencies: [return1, add],
      });

      worker
        .post(4, 5, (n) => {
          n.should.equal(10);
          next();
        })
        .terminate();
    });
  });
});

if (globalThis.RUN_IN_BROWSER) {
  mocha.run();
}