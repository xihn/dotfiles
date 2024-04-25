const Me = imports.misc.extensionUtils.getCurrentExtension();
const search = Me.imports.search;
const utils = Me.imports.utils;
const arena = Me.imports.arena;
const log = Me.imports.log;
const service = Me.imports.launcher_service;
const context = Me.imports.context;
const { Clutter, Gio, GLib, Meta, Shell, St } = imports.gi;
const app_sys = Shell.AppSystem.get_default();
const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;
var Launcher = class Launcher extends search.Search {
    constructor(ext) {
        super();
        this.options = new Map();
        this.options_array = new Array();
        this.windows = new arena.Arena();
        this.service = null;
        this.append_id = null;
        this.active_menu = null;
        this.opened = false;
        this.ext = ext;
        this.dialog.dialogLayout._dialog.y_align = Clutter.ActorAlign.START;
        this.dialog.dialogLayout._dialog.x_align = Clutter.ActorAlign.START;
        this.dialog.dialogLayout.y = 48;
        this.cancel = () => {
            ext.overlay.visible = false;
            this.stop_services(ext);
            this.opened = false;
        };
        this.search = (pat) => {
            if (this.service !== null) {
                this.service.query(pat);
            }
        };
        this.select = (id) => {
            ext.overlay.visible = false;
            if (id >= this.options.size)
                return;
            const option = this.options_array[id];
            if (option && option.result.window) {
                const win = this.ext.windows.get(option.result.window);
                if (!win)
                    return;
                if (win.workspace_id() == ext.active_workspace()) {
                    const { x, y, width, height } = win.rect();
                    ext.overlay.x = x;
                    ext.overlay.y = y;
                    ext.overlay.width = width;
                    ext.overlay.height = height;
                    ext.overlay.visible = true;
                }
            }
        };
        this.activate_id = (id) => {
            var _a;
            ext.overlay.visible = false;
            const selected = this.options_array[id];
            if (selected) {
                (_a = this.service) === null || _a === void 0 ? void 0 : _a.activate(selected.result.id);
            }
        };
        this.complete = () => {
            var _a;
            const option = this.options_array[this.active_id];
            if (option) {
                (_a = this.service) === null || _a === void 0 ? void 0 : _a.complete(option.result.id);
            }
        };
        this.quit = (id) => {
            var _a;
            const option = this.options_array[id];
            if (option) {
                (_a = this.service) === null || _a === void 0 ? void 0 : _a.quit(option.result.id);
            }
        };
        this.copy = (id) => {
            const option = this.options_array[id];
            if (!option)
                return;
            if (option.result.description) {
                Clipboard.set_text(CLIPBOARD_TYPE, option.result.description);
            }
            else if (option.result.name) {
                Clipboard.set_text(CLIPBOARD_TYPE, option.result.name);
            }
        };
    }
    on_response(response) {
        if ("Close" === response) {
            this.close();
        }
        else if ("Update" in response) {
            this.clear();
            if (this.append_id !== null) {
                GLib.source_remove(this.append_id);
                this.append_id = null;
            }
            if (response.Update.length === 0) {
                this.cleanup();
                return;
            }
            this.append_id = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                const item = response.Update.shift();
                if (item) {
                    try {
                        const button = new search.SearchOption(item.name, item.description, item.category_icon ? item.category_icon : null, item.icon ? item.icon : null, this.icon_size(), null, null);
                        const menu = context.addMenu(button.widget, (menu) => {
                            var _a;
                            if (this.active_menu) {
                                this.active_menu.actor.hide();
                            }
                            this.active_menu = menu;
                            (_a = this.service) === null || _a === void 0 ? void 0 : _a.context(item.id);
                        });
                        this.append_search_option(button);
                        const result = { result: item, menu };
                        this.options.set(item.id, result);
                        this.options_array.push(result);
                    }
                    catch (error) {
                        log.error(`failed to create SearchOption: ${error}`);
                    }
                }
                if (response.Update.length === 0) {
                    this.append_id = null;
                    return false;
                }
                return true;
            });
        }
        else if ("Fill" in response) {
            this.set_text(response.Fill);
        }
        else if ("DesktopEntry" in response) {
            this.launch_desktop_entry(response.DesktopEntry);
            this.close();
        }
        else if ("Context" in response) {
            const { id, options } = response.Context;
            const option = this.options.get(id);
            if (option) {
                option.menu.removeAll();
                for (const opt of options) {
                    context.addContext(option.menu, opt.name, () => {
                        var _a;
                        (_a = this.service) === null || _a === void 0 ? void 0 : _a.activate_context(id, opt.id);
                    });
                    option.menu.toggle();
                }
            }
            else {
                log.error(`did not find id: ${id}`);
            }
        }
        else {
            log.error(`unknown response: ${JSON.stringify(response)}`);
        }
    }
    clear() {
        this.options.clear();
        this.options_array.splice(0);
        super.clear();
    }
    launch_desktop_app(app, path) {
        try {
            app.launch([], null);
        }
        catch (why) {
            log.error(`${path}: could not launch by app info: ${why}`);
        }
    }
    launch_desktop_entry(entry) {
        const basename = (name) => {
            return name.substr(name.indexOf('/applications/') + 14).replace('/', '-');
        };
        const desktop_entry_id = basename(entry.path);
        const gpuPref = entry.gpu_preference === "Default"
            ? Shell.AppLaunchGpu.DEFAULT
            : Shell.AppLaunchGpu.DISCRETE;
        log.debug(`launching desktop entry: ${desktop_entry_id}`);
        let app = app_sys.lookup_desktop_wmclass(desktop_entry_id);
        if (!app) {
            app = app_sys.lookup_app(desktop_entry_id);
        }
        if (!app) {
            log.error(`GNOME Shell cannot find desktop entry for ${desktop_entry_id}`);
            log.error(`pop-launcher will use Gio.DesktopAppInfo instead`);
            const dapp = Gio.DesktopAppInfo.new_from_filename(entry.path);
            if (!dapp) {
                log.error(`could not find desktop entry for ${entry.path}`);
                return;
            }
            this.launch_desktop_app(dapp, entry.path);
            return;
        }
        const info = app.get_app_info();
        if (!info) {
            log.error(`cannot find app info for ${desktop_entry_id}`);
            return;
        }
        try {
            app.launch(0, -1, gpuPref);
        }
        catch (why) {
            log.error(`failed to launch application: ${why}`);
            return;
        }
        if (info.get_executable() === "gnome-control-center") {
            app = app_sys.lookup_app("gnome-control-center.desktop");
            if (!app)
                return;
            app.activate();
            const window = app.get_windows()[0];
            if (window) {
                window.get_workspace().activate_with_focus(window, global.get_current_time());
                return;
            }
        }
    }
    list_workspace(ext) {
        for (const window of ext.tab_list(Meta.TabList.NORMAL, null)) {
            this.windows.insert(window);
        }
    }
    load_desktop_files() {
        log.warn("pop-shell: deprecated function called (launcher::load_desktop_files)");
    }
    locate_by_app_info(info) {
        var _a, _b;
        const workspace = this.ext.active_workspace();
        const exec_info = info.get_string("Exec");
        const exec = (_a = exec_info === null || exec_info === void 0 ? void 0 : exec_info.split(' ').shift()) === null || _a === void 0 ? void 0 : _a.split('/').pop();
        if (exec) {
            for (const window of this.ext.tab_list(Meta.TabList.NORMAL, null)) {
                if (window.meta.get_workspace().index() !== workspace)
                    continue;
                const pid = window.meta.get_pid();
                if (pid !== -1) {
                    try {
                        let f = Gio.File.new_for_path(`/proc/${pid}/cmdline`);
                        const [, bytes] = f.load_contents(null);
                        const output = imports.byteArray.toString(bytes);
                        const cmd = (_b = output.split(' ').shift()) === null || _b === void 0 ? void 0 : _b.split('/').pop();
                        if (cmd === exec)
                            return window;
                    }
                    catch (_) {
                    }
                }
            }
        }
        return null;
    }
    open(ext) {
        var _a;
        ext.tiler.exit(ext);
        if (this.opened)
            return;
        if (!ext.settings.fullscreen_launcher() && ((_a = ext.focus_window()) === null || _a === void 0 ? void 0 : _a.meta.is_fullscreen()))
            return;
        this.opened = true;
        const active_monitor = ext.active_monitor();
        const mon_work_area = ext.monitor_work_area(active_monitor);
        const mon_area = ext.monitor_area(active_monitor);
        const mon_width = mon_area ? mon_area.width : mon_work_area.width;
        super._open(global.get_current_time(), false);
        if (!this.dialog.visible) {
            this.clear();
            this.cancel();
            this.close();
            return;
        }
        super.cleanup();
        this.start_services();
        this.search('');
        this.dialog.dialogLayout.x = (mon_width / 2) - (this.dialog.dialogLayout.width / 2);
        let height = mon_work_area.height >= 900 ? mon_work_area.height / 2 : mon_work_area.height / 3.5;
        this.dialog.dialogLayout.y = height - (this.dialog.dialogLayout.height / 2);
    }
    start_services() {
        if (this.service === null) {
            log.debug("starting pop-launcher service");
            const ipc = utils.async_process_ipc(['pop-launcher']);
            this.service = ipc ? new service.LauncherService(ipc, (resp) => this.on_response(resp)) : null;
        }
    }
    stop_services(_ext) {
        if (this.service !== null) {
            log.info(`stopping pop-launcher services`);
            this.service.exit();
            this.service = null;
        }
    }
}
