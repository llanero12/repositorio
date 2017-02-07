const ssdp = require('./ssdpClient');
const electron = require('electron');
// Module to control application life.
const {app} = electron;
// Module to create native browser window.
const {BrowserWindow} = electron;
// In main process.
const {ipcMain} = electron;
// Crash reporter
const {crashReporter} = electron;
// Shell
const {shell} = electron;

const {download} = require('electron-dl');

let buildVersion;
let appVersion;
try {
  const pkg = require('./version');  
  buildVersion = pkg.buildVersion;
  appVersion = pkg.appVersion;
} catch (err) {
  const pkg = require('./package');
  buildVersion = pkg.version;
  appVersion = pkg.version; 
}

const config = {
  minHeightForModals: 525
};

const {dialog} = require('electron');

const fs = require('fs');

const http = require('http');

const userPath = app.getPath('userData');

const diagnosticPackageLocalPath = userPath + '\\..\\HP\\3dPU\\diagnosticPackage\\';

let handleSquirrelEvent;

handleSquirrelEvent = function() {
  var path = require('path');
  var spawn = require('child_process').spawn;

  if (process.platform != 'win32') {
    return false;
  }

  function executeSquirrelCommand(args, done) {
    var updateDotExe = path.resolve(path.dirname(process.execPath),
      '..', 'update.exe');
    var child = spawn(updateDotExe, args, { detached: true });
    child.on('close', function(code) {
      done();
    });
  };

  function install(done) {
    var target = path.basename(process.execPath);
    executeSquirrelCommand(["--createShortcut", target], done);
  };

  function uninstall(done) {
    var target = path.basename(process.execPath);
    executeSquirrelCommand(["--removeShortcut", target], done);
  };

  var squirrelEvent = process.argv[1];
  switch (squirrelEvent) {
    case '--squirrel-install':
      install(app.quit);
      return true;
    case '--squirrel-updated':
      install(app.quit);
      return true;
    case '--squirrel-obsolete':
      app.quit();
      return true;
    case '--squirrel-uninstall':
      uninstall(app.quit);
      return true;
  }

  return false;
};

if(handleSquirrelEvent()) {
  return;
}

crashReporter.start({
  productName: 'HP3D',
  companyName: 'HP',
  submitURL: '',
  autoSubmit: false
});

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win;

/**
 * Read a json from a file and return a json object
 * @param {string} userPath - Folder of user data.
 * @param {string} filename - Name of json file.
 * @returns {Object} 
 */
function readJsonFile (userPath, filename) {
    try {
      prevBackend = fs.readFileSync(userPath+filename);
      prevBackend = JSON.parse(prevBackend);
    } catch (err) {
      prevBackend = {};
    }
    return prevBackend;
}

const backendDiscover = () => {
  let backendsAdded;

  let prevBackend = readJsonFile(userPath,'/prevBackend.json');

    if(prevBackend.servers !== undefined && prevBackend.servers.added !== undefined) { backendsAdded = prevBackend.servers.added;}   

    return new Promise((resolve, reject) => {
      ssdp.getBackendUrl(backendSet => {
        const backends = Array.from(backendSet);

        if (backendsAdded !== undefined && backendsAdded.length > 0) {
                backendsAdded.forEach((element, index, array) => {if (backends.indexOf(array[index]) === -1) { backends.push(array[index]);}});
        }

        resolve(backends);
      }, err => {
        reject(err);
      })
    })
}

function createLoadingScreen(win) {
  loadingScreen = new BrowserWindow({width: 636, height: 384, frame: false, parent: win});
  loadingScreen.loadURL(`file://${__dirname}/dist/loading.html?appVersion=${appVersion}&buildVersion=${buildVersion}`);
  loadingScreen.on('closed', () => loadingScreen = null);
  loadingScreen.webContents.on('did-finish-load', () => {
    loadingScreen.show();
  });
}

function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({width: 1058, height: 686, frame: false});

  win.setMinimumSize(542, 398);
  win.setMovable(true);
  win.hide();

  // Discover backend URL via dgram
  backendDiscover().then(backends => {
    let backend;
    let prevBackend = readJsonFile(userPath,'/prevBackend.json');

    if (prevBackend.servers !== undefined && prevBackend.servers.connected !== undefined) { prevBackend = prevBackend.servers.connected; }

    if (backends.length === 0) {
      backend = 'none';
    } else if (backends.length === 1) {
      backend = encodeURIComponent(backends[0]);
    } else if (backends.length > 1) {

    let coincidence = backends.indexOf(String(prevBackend));

    (coincidence !== -1) ? backend=encodeURIComponent(prevBackend) : backend = 'multiple';
    }
    win.loadURL(`file://${__dirname}/dist/index.html#/monitor?backend=${backend}&appVersion=${appVersion}&buildVersion=${buildVersion}`);
  }, err => {
    win.loadURL(`file://${__dirname}/dist/index.html#/monitor?backend=not-found&appVersion=${appVersion}&buildVersion=${buildVersion}`);
  });

  // Open the DevTools.
  //win.webContents.openDevTools();

  win.on('maximize', function(event) {
    event.sender.send('win-maximized');
  });

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null;
  });

  win.webContents.on('did-finish-load', () => {
    win.show();
/*
    if (loadingScreen) {
      loadingScreen.close();
    }
	*/
  });

  return win;
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  //createLoadingScreen(createWindow());
  createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }
});

ipcMain.on('get-backend-url', (event, arg) => {
  // TODO: error handling
  // Discover backend URL via dgram
  backendDiscover().then(backends => {
    event.sender.send('got-backend-url', backends);
  }, err => {
    event.sender.send('got-backend-url', 'not-found');
  });
})

ipcMain.on('reset-min-height', function() {
  const [w, h] = win.getSize();
  if (h < config.minHeightForModals) {
    win.setSize(w, config.minHeightForModals);
  }
});

ipcMain.on('maximize-main-window', function() {
  win.setMinimumSize(542, 400);
  win.setResizable(true);
  win.maximize();
});

ipcMain.on('restore-main-window', function() {
  win.setMinimumSize(542, 400);
  win.setSize(1058, 686);
  win.setResizable(true);
});

ipcMain.on('widget-frame', function() {
  win.setMinimumSize(202, 306);
  // setSize needs to be called twice to work from maximized window
  win.setSize(0, 0);
  win.setSize(202, 684);
  win.setResizable(false);
});

ipcMain.on('minimize-main-window', function() {
  win.minimize();
});

ipcMain.on('close-main-window', function() {
  win.destroy();
});

ipcMain.on('restart-app', function() {
  win.restart();
});

ipcMain.on('printerAbout', function(event, url) {
  shell.openExternal(url);
});

ipcMain.on('open-folder', (e, args) => {
  shell.showItemInFolder(args.path);
})

ipcMain.on('save-backend-file', (event, arg) => {   
    let prevBackend = readJsonFile(userPath,'/prevBackend.json');

    if (prevBackend.servers !== undefined) { 
        if (arg.url.connected !== undefined) {    
            prevBackend.servers.connected = arg.url.connected;     
        }
        else if (arg.url.added !== undefined) {
            let valueToAdd = arg.url.added;         
            prevBackend.servers.added.push(valueToAdd);         
        }
    } else {
       if (arg.url.connected !== undefined) {
          prevBackend = {'servers':{ 'connected' : arg.url.connected, 'added': []}}
       }
       else if (arg.url.added !== undefined) {
          prevBackend =  {'servers':{'connected': '', 'added' : [arg.url.added]}}; 
       }  
    }
    
    fs.writeFile(userPath+'/prevBackend.json', JSON.stringify(prevBackend), 'utf-8');
});

ipcMain.on('download-file', function(e, args){
  e.preventDefault();

  let urlToDownload= args.url;
  let fileToDownload, diagnosticPackageFile;
  
  if (urlToDownload.indexOf('ServiceInfo') !== -1) {
      fileToDownload = 'service-info.xml';
  } else if (urlToDownload.indexOf('DiagnosticPackage') !== -1) {
      var res = urlToDownload.split("/");
      fileToDownload = res[res.length-1]+'.zip';
  }

  if (res) {  diagnosticPackageFile = res[res.length-1]; }
  if (args.id) { fileToDownload = args.id; }

  function savePathChosenHandler(filepathArg) {
    if (typeof(filepathArg) !== 'string') {
      e.sender.send('error-download-file', 'Cancelled path selection');
    } else {
        if (diagnosticPackageFile !== undefined) {

          fs.stat(diagnosticPackageLocalPath + diagnosticPackageFile, (err, fileStat) => {
              if (err) {
                  if (err.code == 'ENOENT') {
                    e.sender.send('error-download-file', 'File not found'); 
                  }
              } else {
                  if (fileStat.isFile()) {
                        fs.rename( diagnosticPackageLocalPath + diagnosticPackageFile, filepathArg,  (err) => {
                          if (err) { 
                            e.sender.send('error-download-file', err); 
                          } else {
                            e.sender.send('downloaded-file', filepathArg);
                          }
                        });
                  }
              }
          });
        } else {
          let file = fs.createWriteStream(filepathArg);
            return new Promise((resolve, reject) => {
                let responseSent = false; // flag
                http.get(urlToDownload, response => {
                  response.pipe(file);
                  file.on('finish', () => {
                    file.close(() => {              
                      if(responseSent)  return;
                      responseSent = true;
                      e.sender.send('downloaded-file', filepathArg);
                      resolve();
                    });
                  });
                }).on('error', err => {
                    if(responseSent)  return;
                    responseSent = true;
                    e.sender.send('error-download-file', 'Error downloading file');
                    reject(err);
                });
            });
       }
    }    
  }

  dialog.showSaveDialog(null, {defaultPath : fileToDownload}, savePathChosenHandler);
});
/*
ipcMain.on('download-file', (e, args) => {
    download(BrowserWindow.getFocusedWindow(), args.url, { saveAs: true })
        .then(dl => {
          const path = dl.getSavePath();
          //TODO: electron-dl has an update method but not exposed, use Electron
          // DownloadItem API directly or contribute to electron-dl :)
          e.sender.send('downloaded-file', path);
        })
        .catch(err => {
          e.sender.send('error-download-file', err);
        });
});
*/