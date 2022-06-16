import fs from 'fs';
import browserify from 'browserify';
import gulp from 'gulp';
import prettier from 'gulp-prettier';
import header from 'gulp-header';
import eslint from 'gulp-eslint-new';
import newFile from 'gulp-file';
import path from 'path';
import tap from 'gulp-tap';

import pkg from './package.json';

export function peggy() {
    return gulp.src('src/**/*.peg')
        .pipe(tap(function (file) {
            const filename = path.basename(file.path).split(".")[0] + ".js";
            const raw = fs.readFileSync(file.path, 'utf8');
            const contents = `import * as peggy from 'peggy';\nconst grammars = String.raw\`\n${raw}\n\`;\nlet parser;\nexport default function getParser() { if(!parser) { parser = peggy.generate(grammars); } return parser; }`;
            return newFile(filename, contents)
                .pipe(gulp.dest(path.dirname(file.path)))
        }));
}

export function lint() {
    return gulp
        .src('src/**/*.js')
        .pipe(eslint({fix: true}))
        .pipe(eslint.fix())
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
}

export function styles() {
    return gulp
        .src('src/**/*.js')
        .pipe(prettier({
            singleQuote: true, trailingComma: 'all', tabWidth: 4, bracketSpacing: true
        }))
        .pipe(gulp.dest((file) => file.base));
}

function scripts(src, dest) {
    return () => {
        return browserify(src)
            .transform('babelify', {
                presets: [['@babel/preset-env']],
                plugins: [
                    [
                        'babel-plugin-relative-path-import',
                        {
                            paths: [
                                {
                                    'rootPathPrefix': '@',
                                    'rootPathSuffix': 'src',
                                }
                            ]
                        }
                    ]
                ]
            })
            .plugin('tinyify')
            .bundle()
            .pipe(fs.createWriteStream(dest));
    };
}

function banner(dest) {
    return () => gulp
        .src(dest)
        .pipe(header(fs.readFileSync('./banner', 'utf-8'), {pkg, updated: new Date().toLocaleString()}))
        .pipe(gulp.dest((file) => file.base));
}

const artifacts = [
    {src: 'src/main.js', dest: 'sub-store.min.js'},
    {src: 'src/products/resource-parser.loon.js', dest: 'dist/sub-store-parser.loon.min.js'}
];

export const build = gulp.series(gulp.parallel(artifacts.map(artifact => scripts(artifact.src, artifact.dest))), gulp.parallel(artifacts.map(artifact => banner(artifact.dest))));

const all = gulp.series(peggy, lint, styles, build)

export default all;
