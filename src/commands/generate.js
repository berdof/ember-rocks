'use strict';

var path = require('path');
var fs = require('fs');
var argv = require('minimist')(process.argv.slice(2));
var tildify = require('tildify');
var gulp = require('gulp');
var gutil = require('gulp-util');
var replace = require('gulp-replace');
var rename = require('gulp-rename');
var stringUtils = require('../utils/string');

function validateComponentName (filename) {
  if (filename.indexOf('-') === -1) {
    gutil.log(
      gutil.colors.red('[-Error:] '),
      gutil.colors.cyan(filename),
      gutil.colors.red(' must be a dashize string. ex: my-component')
    );
    gutil.log(
      gutil.colors.red('[-Error:]  Generate task has been canceled')
    );
    process.exit(0);
  }
}

function checkFileExisted (fullFilePath, injection, fileName, ext, destPath) {
  if (fs.existsSync(fullFilePath)) {
    if (!!injection) {
      gutil.log(
        gutil.colors.red('[-Warning:] '),
        gutil.colors.cyan(fileName + ext),
        gutil.colors.red('has existed at '),
        gutil.colors.magenta(tildify(destPath))
      );
      // Does not continue to generate file, but won't stop the process
      return true;
    } else {
      gutil.log(
        gutil.colors.red('[-Error:] '),
        gutil.colors.cyan(fileName + ext),
        gutil.colors.red('has existed at '),
        gutil.colors.magenta(tildify(destPath))
      );
      gutil.log(
        gutil.colors.red('[-Error:]  Generate task has been canceled')
      );
      // File is existed in the system, kill the process
      process.exit(0);
    }
  }
}

function generatorEngine (type, srcPath, injection, moduleName, fileName, destPath) {
  var ext = (type === 'template') ? '.hbs' : '.js';
  var fullFilePath = destPath + '/' + fileName + ext;

  // if the file has existed, it will abort the task
  // if return true, mean that it is an injection file, which already exist in the system
  // handle the case in the next condition
  var stopGenerateFile = checkFileExisted(fullFilePath, injection, fileName, ext, destPath);
  // check if template is existed or not, not going to kill the process
  // only stop the generator task on this operation
  if(stopGenerateFile) {
    return ;
  }

  var dasherizeName = '';
  var classifyName = '';
  var matcher;

  // if generating any testing files, need to clean up moduleName without "Test"
  if (type.indexOf('test') > -1) {
    if (type.indexOf('model-test') > -1) {
      moduleName = moduleName.replace(/ModelTest(\s+)?$/, '');
      dasherizeName = stringUtils.dasherize(moduleName);
    } else {
      matcher = stringUtils.classify(type);
      var dasherizeModuleName = moduleName.replace(new RegExp(matcher), '');

      moduleName = moduleName.replace(/Test(\s+)?$/, '');
      dasherizeName = stringUtils.dasherize(dasherizeModuleName);
    }
  } else {
    matcher = stringUtils.capitalize(type);
    var localModuleName = moduleName.replace(new RegExp(matcher), '');

    dasherizeName = stringUtils.dasherize(localModuleName);
    classifyName = stringUtils.classify(localModuleName);
  }

  // @TODO when generate multiple files on certain type
  // moduleName is not being defined correctly.
  // fine for now, since multiple file generation are only template file
  return gulp.src(srcPath)
    .pipe(replace(/__NAMESPACE__/g, moduleName))
    // __DASHERIZE_NAMESPACE__  mainly used in `-test` generator
    .pipe(replace(/__DASHERIZE_NAMESPACE__/g, dasherizeName))
    // __CLASSIFY_NAMESPACE__ mainly used in regular generator
    .pipe(replace(/__CLASSIFY_NAMESPACE__/g, classifyName))
    .pipe(rename({
      basename: fileName,
      extname:  ext
    }))
    .on('end', function () {
      gutil.log(
        gutil.colors.green('[-done:] Generate'),
        gutil.colors.cyan(fileName + ext),
        gutil.colors.green('at'),
        gutil.colors.magenta(tildify(destPath))
      );
    })
    .pipe(gulp.dest(destPath));
}

function setupTask (generator) {
  // task: gen
  // @describe	generate an model,view,store,controller from base template
  return gulp.task('gen', function () {
    var type = generator.type;
    var name = generator.name;
    var pathName = '';
    var moduleName = '';
    var i = 0;
    var pathNested; // Boolean
    var fileName; // setup the fileName which used for rename module

    // based on the passing name arguments, to determine it is an nested folder structure
    // or it is a simple file generation. assign a var `fileName` for current file name
    if (name.indexOf('/') > -1) {
      name = name.split('/');
      pathNested = true;
      fileName = name.pop();
    } else {
      pathNested = false;
      fileName = name;
    }

    // handle the error case when arg is `component:foo`
    // component name has to be dash separated string
    // case 1: `em g component:name`         <= simple case
    // case 2: `em g component:nested/name`  <= nested case
    if (type === 'component') {
      validateComponentName(fileName);
    }
    // when type is template, name[0] is component, name of nest path has to be dashized string
    // case 3: `em g template:component/name`  <= nested case in template
    if (type === 'template' && pathNested && name[0] === 'component') {
      validateComponentName(fileName);
    }

    // Setup `pathName`
    // `moduleName` would be used inside replacement of template placeholder
    if (pathNested) {
      // build up the nested path
      for (; i < name.length; i++) {
        // 'component' and 'components' resolve as a 'app/templates/components/'
        if (type === 'template' && name[0] === 'component') {
          name[i] = 'components';
        }
        pathName += '/' + name[i];
        moduleName += name[i] + '_';
      }
      // append fileName to the moduleName string
      moduleName += fileName;
    } else {
      pathName += name;
      moduleName = name;
    }
    // Classify the moduleName in format of `MattMaController`
    moduleName = stringUtils.classify(moduleName + '_' + type);

    // ignore the 'store' case, since it is already created
    var typeFolder = path.resolve('client/app', type + 's');

    // if client/app/[type](s) is not existed and it is not a test generator, simply create one
    if (!fs.existsSync(typeFolder) && type.indexOf('test') === -1) {
      fs.mkdirSync(typeFolder);
      gutil.log(
        gutil.colors.gray('[-log:] Created a new folder at '),
        gutil.colors.cyan('~/client/app/' + type + 's')
      );
    }

    // when generator type is route or component
    // it will also generate the template as well
    var srcPath =
      (type === 'route' || type === 'component') ?
        [{
          type:          type,
          generatorPath: path.join(__dirname, '..', 'skeletons/generators', type) + '.js'
        }, {
          type:          'template',
          injection:     ( type === 'component' ) ? 'components' : true,
          generatorPath: path.join(__dirname, '..', 'skeletons/generators/template.js')
        }]
        : path.join(__dirname, '..', 'skeletons/generators', type) + '.js';

    var dirName, finalDirName, finalPath, destPath;

    // if type is test, or route-test or any sorts, it should append `-test` to the filename
    fileName = (type.indexOf('test') > -1) ? fileName + '-test' : fileName;

    // if it is a string, simple call generatorEngine once
    // else it is an object(array), repeat the generatorEngine call
    if (typeof srcPath === 'string') {
      dirName = (type === 'store') ? type : (type.slice(-1) === 's') ? type : type + 's';

      // Figure out the type is testing generator
      if (type.indexOf('test') > -1) {
        // Is it an Unit Test generator or Integration Test generator
        if (type.indexOf('-test') > -1) {
          var typeArray = type.split('-');
          finalDirName = 'tests/unit/' + typeArray[0] + 's';
        } else {
          finalDirName = dirName + '/integration';
        }
      } else {
        finalDirName = dirName;
      }

      finalPath = pathNested ? finalDirName + pathName : finalDirName;

      destPath = (type.indexOf('test') > -1) ?
      path.resolve('client') + '/' + finalPath :
      path.resolve('client/app') + '/' + finalPath;

      generatorEngine(type, srcPath, null, moduleName, fileName, destPath);
    } else {
      for (var j = 0, l = srcPath.length; j < l; j++) {
        var _type = srcPath[j].type;
        // when original type is 'component'
        // it will create a template file at 'templates/components' folder
        var injection = srcPath[j].injection;

        dirName = (_type === 'store') ? _type : (_type.slice(-1) === 's') ? _type : _type + 's';
        dirName = (injection === 'components') ? dirName + '/' + injection : dirName;

        finalPath = pathNested ? dirName + pathName : dirName;
        destPath = path.resolve('client/app') + '/' + finalPath;

        generatorEngine(
          _type, srcPath[j].generatorPath, injection, moduleName, fileName, destPath
        );
      }
    }
  });
}

// Check the fullname attribute is correct or not
var VALID_FULL_NAME_REGEXP = /^[^:]+.+:[^:]+$/;

function errorHandler (fullName) {
  gutil.log(
    gutil.colors.red('[-Error:] Invalid argument, expected: `type:name` got: '),
    gutil.colors.bold(fullName)
  );

  gutil.log(
    '[-Syntax:]',
    gutil.colors.cyan('type:name'), ' ex: em generate route:post'
  );

  gutil.log(
    gutil.colors.red('[-Error:]'),
    'See \'em generate --help\''
  );
  process.exit(0);
}

var generate = function (options) {
  // if the folder 'client/app' is not existed
  // can assume that the project may not be created by Ember Rocks
  if (!fs.existsSync('client') && !fs.existsSync('client/app')) {
    gutil.log(
      gutil.colors.red(
        '[-Error:] This project may not be created by \'Ember-Rocks\'\n'
      ),
      gutil.colors.red(
        '[-Error:] `em new [dirName]` does not install the NPM packages dependencies correctly'
      )
    );
    process.exit(1);
  }

  // Error out when user did not provide any argument
  if (argv._.length < 2) {
    gutil.log(gutil.colors.red('[-Error:] Missing type:name argument.'), 'ex: em new route:post');
    gutil.log(gutil.colors.red('[-Error:]'), 'See \'em generate --help\'');
    process.exit(0);
  }

  var typeAndName = argv._.slice()[1];

  if (!VALID_FULL_NAME_REGEXP.test(typeAndName)) {
    errorHandler(typeAndName);
  }

  var validTypes = [
    'adapter', 'component', 'controller', 'helper', 'initializer', 'mixin', 'model',
    'route', 'serializer', 'template', 'transform', 'util', 'view',
    'test', 'adapter-test', 'component-test', 'controller-test', 'helper-test',
    'initializer-test', 'mixin-test', 'model-test', 'route-test', 'serializer-test',
    'transform-test', 'util-test', 'view-test'
  ];
  var gen;
  var generatorAndTasks = typeAndName.split(':', 2);
  var type = generatorAndTasks[0];
  var name = generatorAndTasks[1];

  // type could be either route or routes
  type = (type.slice(-1) === 's') ? type.substring(0, type.length - 1) : type;

  // Type must be in the `validTypes` array
  if (validTypes.indexOf(type) > -1) {
    // Name must be a valid string
    if (name.length > 0) {
      gen = {
        type: type,
        name: name
      };
    } else {
      gutil.log(
        gutil.colors.red('[-Error:] '),
        gutil.colors.cyan(name),
        gutil.colors.red(' must be a valid string.')
      );
      gutil.log(gutil.colors.red('[-Error:]'), 'See \'em generate --help\'');
      process.exit(0);
    }
  } else {
    gutil.log(
      gutil.colors.red('[-Error:] '),
      gutil.colors.cyan(type),
      gutil.colors.red(' is not a valid type.')
    );
    gutil.log(
      gutil.colors.bold('[-note:] valid types are'),
      gutil.colors.cyan(validTypes.join(', '))
    );
    process.exit(0);
  }

  setupTask(gen);
  // Trigger the generator task
  gulp.start('gen');
};

module.exports = generate;
