'use strict';

/**
 * Returns a self-invoking, string representation of a function
 *
 * @param {Function} func
 * @returns {String}
 */
export function functionToInstantString(func) {
	return '(' + func.toString() + ')();';
}

/**
 * Returns a string representation of an array of functions.
 * Useful only if the functions are named.
 *
 * @param {Function[]} array - Array of functions
 * @returns {String}
 */
export function stringifyFunctionList(array) {
	return array.reduce((prev, next) => prev + next.toString() + ';', '');
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
	const xhr = new XMLHttpRequest();

	xhr.onreadystatechange = () => {
		if (xhr.readyState === 4 && xhr.status === 200) {
			success(xhr.responseText)
		}
	};
	xhr.open('GET', url, true);
	xhr.send();
}
