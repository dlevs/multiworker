import fetch from 'cross-fetch';

/**
 * Returns a self-invoking, string representation of a function
 *
 * @param {Function} func
 * @returns {String}
 */
export function functionToInstantString(func) {
  return `(${func.toString()})();`;
}

/**
 * Returns a string representation of an array of functions.
 * Useful only if the functions are named.
 *
 * @param {Function[]} array - Array of functions
 * @returns {String}
 */
export function stringifyFunctionList(array) {
  return array.reduce((prev, next) => `${prev + next.toString()};`, '');
}

/**
 * No operation
 */
export function noop() {
}

/**
 * Simple get request.
 *
 * @param {String} url
 * @param {Function} success
 */
export function get(url, success) {
  fetch(url).then((response) => response.text()).then(success).catch(e => {
    if (url.startsWith('file://')) {
      url = url.substr(7);
    }
    import('fs').then(fs => {
      fs.readFile(url, 'utf8', (err, data) => {
        if (err) {
          throw err;
        };
        success(data);
      });
    }).catch(e => {throw e});
  });
}
