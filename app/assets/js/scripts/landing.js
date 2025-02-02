/**
 * Script for landing.ejs
 */
// Requirements
const cp                      = require('child_process')
const crypto                  = require('crypto')
const { URL }                 = require('url')

// Internal Requirements
const ProcessBuilder          = require('./assets/js/processbuilder')

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text               = document.getElementById('user_text')

const loggerLanding = LoggerUtil1('%c[Landing]', 'color: #000668; font-weight: bold')

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    if(loading){
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} value The progress value.
 * @param {number} max The total size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setLaunchPercentage(value, max, percent = ((value/max)*100)){
    launch_progress.setAttribute('max', max)
    launch_progress.setAttribute('value', value)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} value The progress value.
 * @param {number} max The total download size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setDownloadPercentage(value, max, percent = ((value/max)*100)){
    remote.getCurrentWindow().setProgressBar(value/max)
    setLaunchPercentage(value, max, percent)
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    document.getElementById('launch_button').disabled = !val
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', function(e){
    loggerLanding.log('Lancement du jeu..')
    const mcVersion = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()).getMinecraftVersion()
    const jExe = ConfigManager.getJavaExecutable()
    if(jExe == null){
        asyncSystemScan(mcVersion)
    } else {

        setLaunchDetails('Veuillez patienter')
        toggleLaunchArea(true)
        setLaunchPercentage(0, 100)

        const jg = new JavaGuard(mcVersion)
        jg._validateJavaBinary(jExe).then((v) => {
            loggerLanding.log('Java version meta', v)
            if(v.valid){
                dlAsync()
            } else {
                asyncSystemScan(mcVersion)
            }
        })
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = (e) => {
    prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = (e) => {
    prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = 'No Account Selected'
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
        }
        if(authUser.uuid != null){
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://mc-heads.net/body/${authUser.uuid}/right')`
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv){
    if(getCurrentView() === VIEWS.settings){
        saveAllModConfigurations()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.getID() : null)
    ConfigManager.save()
    server_selection_button.innerHTML = '\u2022 ' + (serv != null ? serv.getName() : 'Aucun serveur sélectionné')
    if(getCurrentView() === VIEWS.settings){
        animateModsTabRefresh()
    }
    setLaunchEnabled(serv != null)
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '\u2022 Chargement..'
server_selection_button.onclick = (e) => {
    e.target.blur()
    toggleServerSelection(true)
}

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        'Okay'
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

let sysAEx

let extractListener

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {string} mcVersion The Minecraft version we are scanning for.
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
function asyncSystemScan(mcVersion, launchAfter = true){

    setLaunchDetails('Veuillez patienter..')
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const loggerSysAEx = LoggerUtil1('%c[SysAEx]', 'color: #353232; font-weight: bold')

    const forkEnv = JSON.parse(JSON.stringify(process.env))
    forkEnv.CONFIG_DIRECT_PATH = ConfigManager.getLauncherDirectory()

    // Fork a process to run validations.
    sysAEx = cp.fork(path.join(__dirname, 'assets', 'js', 'assetexec.js'), [
        'JavaGuard',
        mcVersion
    ], {
        env: forkEnv,
        stdio: 'pipe'
    })
    // Stdout
    sysAEx.stdio[1].setEncoding('utf8')
    sysAEx.stdio[1].on('data', (data) => {
        loggerSysAEx.log(data)
    })
    // Stderr
    sysAEx.stdio[2].setEncoding('utf8')
    sysAEx.stdio[2].on('data', (data) => {
        loggerSysAEx.log(data)
    })
    
    sysAEx.on('message', (m) => {

        if(m.context === 'validateJava'){
            if(m.result == null){
                // If the result is null, no valid Java installation was found.
                // Show this information to the user.
                setOverlayContent(
                    'No Compatible<br>Java Installation Found',
                    'Pour rejoindre les serveurs de NG4M, vous avez besoin d\'une installation 64 bits de Java 8. Souhaitez-vous que nous installions une copie ?',
                    'Installer Java',
                    'Installer manuellement'
                )
                setOverlayHandler(() => {
                    setLaunchDetails('Préparation du téléchargement Java..')
                    sysAEx.send({task: 'changeContext', class: 'AssetGuard', args: [ConfigManager.getCommonDirectory(),ConfigManager.getJavaExecutable()]})
                    sysAEx.send({task: 'execute', function: '_enqueueOpenJDK', argsArr: [ConfigManager.getDataDirectory()]})
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    $('#overlayContent').fadeOut(250, () => {
                        //$('#overlayDismiss').toggle(false)
                        setOverlayContent(
                            'Java is Required<br>to Launch',
                            'Une installation x64 valide de Java 8 est requise pour le lancement.<br><br>Veuillez l\'installer via <a href="https://www.java.com/fr/download/manual.jsp">https://www.java.com/fr/download/manual.jsp</a> ',
                            'Je comprends',
                            'Retour'
                        )
                        setOverlayHandler(() => {
                            toggleLaunchArea(false)
                            toggleOverlay(false)
                        })
                        setDismissHandler(() => {
                            toggleOverlay(false, true)
                            asyncSystemScan()
                        })
                        $('#overlayContent').fadeIn(250)
                    })
                })
                toggleOverlay(true, true)

            } else {
                // Java installation found, use this to launch the game.
                ConfigManager.setJavaExecutable(m.result)
                ConfigManager.save()

                // We need to make sure that the updated value is on the settings UI.
                // Just incase the settings UI is already open.
                settingsJavaExecVal.value = m.result
                populateJavaExecDetails(settingsJavaExecVal.value)

                if(launchAfter){
                    dlAsync()
                }
                sysAEx.disconnect()
            }
        } else if(m.context === '_enqueueOpenJDK'){

            if(m.result === true){

                // Oracle JRE enqueued successfully, begin download.
                setLaunchDetails('Téléchargement de Java..')
                sysAEx.send({task: 'execute', function: 'processDlQueues', argsArr: [[{id:'java', limit:1}]]})

            } else {

                // Oracle JRE enqueue failed. Probably due to a change in their website format.
                // User will have to follow the guide to install Java.
                setOverlayContent(
                    'Unexpected Issue:<br>Java Download Failed',
                    'Unfortunately we\'ve encountered an issue while attempting to install Java. You will need to manually install a copy. Please check out our <a href="https://github.com/dscalzi/HeliosLauncher/wiki">Troubleshooting Guide</a> for more details and instructions.',
                    'I Understand'
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                    toggleLaunchArea(false)
                })
                toggleOverlay(true)
                sysAEx.disconnect()

            }

        } else if(m.context === 'progress'){

            switch(m.data){
                case 'download':
                    // Downloading..
                    setDownloadPercentage(m.value, m.total, m.percent)
                    break
            }

        } else if(m.context === 'complete'){

            switch(m.data){
                case 'download': {
                    // Show installing progress bar.
                    remote.getCurrentWindow().setProgressBar(2)

                    // Wait for extration to complete.
                    const eLStr = 'Extracting'
                    let dotStr = ''
                    setLaunchDetails(eLStr)
                    extractListener = setInterval(() => {
                        if(dotStr.length >= 3){
                            dotStr = ''
                        } else {
                            dotStr += '.'
                        }
                        setLaunchDetails(eLStr + dotStr)
                    }, 750)
                    break
                }
                case 'java':
                // Download & extraction complete, remove the loading from the OS progress bar.
                    remote.getCurrentWindow().setProgressBar(-1)

                    // Extraction completed successfully.
                    ConfigManager.setJavaExecutable(m.args[0])
                    ConfigManager.save()

                    if(extractListener != null){
                        clearInterval(extractListener)
                        extractListener = null
                    }

                    setLaunchDetails('Java installé!')

                    if(launchAfter){
                        dlAsync()
                    }

                    sysAEx.disconnect()
                    break
            }

        } else if(m.context === 'error'){
            console.log(m.error)
        }
    })

    // Begin system Java scan.
    setLaunchDetails('Vérification des informations système..')
    sysAEx.send({task: 'execute', function: 'validateJava', argsArr: [ConfigManager.getDataDirectory()]})

}

// Keep reference to Minecraft Process
let proc
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+)$/
const MIN_LINGER = 5000

let aEx
let serv
let versionData
let forgeData

let progressListener

function dlAsync(login = true){

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    if(login) {
        if(ConfigManager.getSelectedAccount() == null){
            loggerLanding.error('You must be logged into an account.')
            showLaunchFailure("Aucun compte", "Vous devez sélectionner un compte pour pouvoir lancer le jeux")
            return
        }
    }

    setLaunchDetails('Veuillez patienter..')
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const loggerAEx = LoggerUtil1('%c[AEx]', 'color: #353232; font-weight: bold')
    const loggerLaunchSuite = LoggerUtil1('%c[LaunchSuite]', 'color: #000668; font-weight: bold')

    const forkEnv = JSON.parse(JSON.stringify(process.env))
    forkEnv.CONFIG_DIRECT_PATH = ConfigManager.getLauncherDirectory()

    // Start AssetExec to run validations and downloads in a forked process.
    aEx = cp.fork(path.join(__dirname, 'assets', 'js', 'assetexec.js'), [
        'AssetGuard',
        ConfigManager.getCommonDirectory(),
        ConfigManager.getJavaExecutable()
    ], {
        env: forkEnv,
        stdio: 'pipe'
    })
    // Stdout
    aEx.stdio[1].setEncoding('utf8')
    aEx.stdio[1].on('data', (data) => {
        loggerAEx.log(data)
    })
    // Stderr
    aEx.stdio[2].setEncoding('utf8')
    aEx.stdio[2].on('data', (data) => {
        loggerAEx.log(data)
    })
    aEx.on('error', (err) => {
        loggerLaunchSuite.error('Error during launch', err)
        showLaunchFailure('Erreur lors du lancement', err.message || 'Voir console (CTRL + Shift + i) pour plus de détails')
    })
    aEx.on('close', (code, signal) => {
        if(code !== 0){
            loggerLaunchSuite.error(`AssetExec est sorti avec le code ${code}, en supposant une erreur.`)
            showLaunchFailure('Erreur lors du lancement', 'Voir console (CTRL + Shift + i) pour plus de détails.')
        }
    })

    // Establish communications between the AssetExec and current process.
    aEx.on('message', (m) => {

        if(m.context === 'validate'){
            switch(m.data){
                case 'distribution':
                    setLaunchPercentage(20, 100)
                    loggerLaunchSuite.log('Validated distibution index.')
                    setLaunchDetails('Chargement des informations..')
                    break
                case 'version':
                    setLaunchPercentage(40, 100)
                    loggerLaunchSuite.log('Version data loaded.')
                    setLaunchDetails('Validation de l\'intégrité des assets..')
                    break
                case 'assets':
                    setLaunchPercentage(60, 100)
                    loggerLaunchSuite.log('Asset Validation Complete')
                    setLaunchDetails('Validation de l\'intégrité des library..')
                    break
                case 'libraries':
                    setLaunchPercentage(80, 100)
                    loggerLaunchSuite.log('Library validation complete.')
                    setLaunchDetails('Validation de l\'intégrité des fichiers divers..')
                    break
                case 'files':
                    setLaunchPercentage(100, 100)
                    loggerLaunchSuite.log('File validation complete.')
                    setLaunchDetails('Téléchargement des fichiers..')
                    break
            }
        } else if(m.context === 'progress'){
            switch(m.data){
                case 'assets': {
                    const perc = (m.value/m.total)*20
                    setLaunchPercentage(40+perc, 100, parseInt(40+perc))
                    break
                }
                case 'download':
                    setDownloadPercentage(m.value, m.total, m.percent)
                    break
                case 'extract': {
                    // Show installing progress bar.
                    remote.getCurrentWindow().setProgressBar(2)

                    // Download done, extracting.
                    const eLStr = 'Extracting libraries'
                    let dotStr = ''
                    setLaunchDetails(eLStr)
                    progressListener = setInterval(() => {
                        if(dotStr.length >= 3){
                            dotStr = ''
                        } else {
                            dotStr += '.'
                        }
                        setLaunchDetails(eLStr + dotStr)
                    }, 750)
                    break
                }
            }
        } else if(m.context === 'complete'){
            switch(m.data){
                case 'download':
                    // Download and extraction complete, remove the loading from the OS progress bar.
                    remote.getCurrentWindow().setProgressBar(-1)
                    if(progressListener != null){
                        clearInterval(progressListener)
                        progressListener = null
                    }

                    setLaunchDetails('Préparation au lancement..')
                    break
            }
        } else if(m.context === 'error'){
            switch(m.data){
                case 'download':
                    loggerLaunchSuite.error('Error while downloading:', m.error)
                    
                    if(m.error.code === 'ENOENT'){
                        showLaunchFailure(
                            'Download Error',
                            'Impossible de se connecter au serveur de fichiers. Assurez-vous que vous êtes connecté à Internet et réessayez.'
                        )
                    } else {
                        showLaunchFailure(
                            'Download Error',
                            'Vérifiez la console (CTRL + Shift + i) pour plus de détails. Veuillez réessayer.'
                        )
                    }

                    remote.getCurrentWindow().setProgressBar(-1)

                    // Disconnect from AssetExec
                    aEx.disconnect()
                    break
            }
        } else if(m.context === 'validateEverything'){

            let allGood = true

            // If these properties are not defined it's likely an error.
            if(m.result.forgeData == null || m.result.versionData == null){
                loggerLaunchSuite.error('Error during validation:', m.result)

                loggerLaunchSuite.error('Error during launch', m.result.error)
                showLaunchFailure('Erreur lors du lancement', 'Voir console (CTRL + Shift + i) pour plus de détails.')

                allGood = false
            }

            forgeData = m.result.forgeData
            versionData = m.result.versionData

            if(login && allGood) {
                const authUser = ConfigManager.getSelectedAccount()
                loggerLaunchSuite.log(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
                let pb = new ProcessBuilder(serv, versionData, forgeData, authUser, remote.app.getVersion())
                setLaunchDetails('lancement du jeu..')

                // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
                const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`)

                const onLoadComplete = () => {
                    toggleLaunchArea(false)
                    proc.stdout.removeListener('data', tempListener)
                    proc.stderr.removeListener('data', gameErrorListener)
                }
                const start = Date.now()

                // Attach a temporary listener to the client output.
                // Will wait for a certain bit of text meaning that
                // the client application has started, and we can hide
                // the progress bar stuff.
                const tempListener = function(data){
                    if(GAME_LAUNCH_REGEX.test(data.trim())){
                        const diff = Date.now()-start
                        if(diff < MIN_LINGER) {
                            setTimeout(onLoadComplete, MIN_LINGER-diff)
                        } else {
                            onLoadComplete()
                        }
                    }
                }

                const gameErrorListener = function(data){
                    data = data.trim()
                    if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                        loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                        showLaunchFailure('Error During Launch', 'The main file, LaunchWrapper, failed to download properly. As a result, the game cannot launch.<br><br>To fix this issue, temporarily turn off your antivirus software and launch the game again.<br><br>If you have time, please <a href="https://github.com/dscalzi/HeliosLauncher/issues">submit an issue</a> and let us know what antivirus software you use. We\'ll contact them and try to straighten things out.')
                    }
                }

                try {
                    // Build Minecraft process.
                    proc = pb.build()

                    // Bind listeners to stdout.
                    proc.stdout.on('data', tempListener)
                    proc.stderr.on('data', gameErrorListener)

                    setLaunchDetails('Terminé. Profitez du serveur!')

                } catch(err) {

                    loggerLaunchSuite.error('Error during launch', err)
                    showLaunchFailure('Erreur lors du lancement', 'Voir console (CTRL + Shift + i) pour plus de détails.')

                }
            }

            // Disconnect from AssetExec
            aEx.disconnect()

        }
    })

    // Begin Validations

    // Validate Forge files.
    setLaunchDetails('Chargement des informations du serveur..')

    refreshDistributionIndex(true, (data) => {
        onDistroRefresh(data)
        serv = data.getServer(ConfigManager.getSelectedServer())
        aEx.send({task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()]})
    }, (err) => {
        loggerLaunchSuite.log('Error while fetching a fresh copy of the distribution index.', err)
        refreshDistributionIndex(false, (data) => {
            onDistroRefresh(data)
            serv = data.getServer(ConfigManager.getSelectedServer())
            aEx.send({task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()]})
        }, (err) => {
            loggerLaunchSuite.error('Unable to refresh distribution index.', err)
            if(DistroManager.getDistribution() == null){
                showLaunchFailure('Fatal Error', 'Impossible de charger une copie de l\'index de distribution. Voir la console (CTRL + Shift + i) pour plus de détails.')

                // Disconnect from AssetExec
                aEx.disconnect()
            } else {
                serv = data.getServer(ConfigManager.getSelectedServer())
                aEx.send({task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()]})
            }
        })
    })
}