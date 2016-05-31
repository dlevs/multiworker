'use strict';

// Dependencies
//------------------------------------------------
const gulp        = require('gulp');
const uglify      = require('gulp-uglify');
const rename      = require('gulp-rename');
const source      = require('vinyl-source-stream');
const buffer      = require('vinyl-buffer');
const watchify    = require('watchify');
const browserify  = require('browserify');
const notify      = require('gulp-notify');
const gutil       = require('gulp-util');
const derequire   = require('gulp-derequire');
const packageJson = require('./package');


// App variables
//------------------------------------------------
const paths             = {
	scripts: {
		src:  'src/index.js',
		dest: 'dist'
	}
};
const browserifyOptions = Object.assign({}, watchify.args, {
	entries:    paths.scripts.src,
	debug:      true,
	plugin:     [watchify],
	standalone: 'MultiWorker'
});


// Browserify bundler
//------------------------------------------------
const b = browserify(browserifyOptions);

b.transform('babelify', {presets: ['es2015']});
b.on('update', filepaths => {
	gutil.log(`Watchify '${gutil.colors.cyan(filepaths)}' changed`);
	gulp.start('scripts');
});


// Gulp tasks
//------------------------------------------------
gulp.task('scripts', () => {
	return b.bundle()
		.on('error', notify.onError('Error: <%= error.message %>'))
		.pipe(source(`${packageJson.name}.js`))
		.pipe(buffer())
		.pipe(derequire())

		// Normal JS build
		.pipe(gulp.dest(paths.scripts.dest))

		// Minified JS build
		.pipe(uglify())
		.pipe(rename(`${packageJson.name}.min.js`))
		.pipe(gulp.dest(paths.scripts.dest));
});
gulp.task('default', ['scripts']);
