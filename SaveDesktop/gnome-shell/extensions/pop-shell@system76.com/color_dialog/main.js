#!/usr/bin/gjs
"use strict";
imports.gi.versions.Gtk = '3.0';
const { Gio, GLib, Gtk, Gdk } = imports.gi;
const EXT_PATH_DEFAULTS = [
    GLib.get_home_dir() + "/.local/share/gnome-shell/extensions/",
    "/usr/share/gnome-shell/extensions/"
];
const DEFAULT_HINT_COLOR = 'rgba(251, 184, 108, 1)';
function getExtensionPath(uuid) {
    let ext_path = null;
    for (let i = 0; i < EXT_PATH_DEFAULTS.length; i++) {
        let path = EXT_PATH_DEFAULTS[i];
        let file = Gio.File.new_for_path(path + uuid);
        log(file.get_path());
        if (file.query_exists(null)) {
            ext_path = file;
            break;
        }
    }
    ;
    return ext_path;
}
function getSettings(schema) {
    let extensionPath = getExtensionPath("pop-shell@system76.com");
    if (!extensionPath)
        throw new Error('getSettings() can only be called when extension is available');
    const GioSSS = Gio.SettingsSchemaSource;
    const schemaDir = extensionPath.get_child('schemas');
    let schemaSource = schemaDir.query_exists(null) ?
        GioSSS.new_from_directory(schemaDir.get_path(), GioSSS.get_default(), false) :
        GioSSS.get_default();
    const schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj) {
        throw new Error("Schema " + schema + " could not be found for extension ");
    }
    return new Gio.Settings({ settings_schema: schemaObj });
}
function launch_color_dialog() {
    let popshell_settings = getSettings("org.gnome.shell.extensions.pop-shell");
    let color_dialog = new Gtk.ColorChooserDialog({
        title: "Choose Color"
    });
    color_dialog.show_editor = true;
    color_dialog.show_all();
    let rgba = new Gdk.RGBA();
    if (rgba.parse(popshell_settings.get_string("hint-color-rgba"))) {
        color_dialog.set_rgba(rgba);
    }
    else {
        rgba.parse(DEFAULT_HINT_COLOR);
        color_dialog.set_rgba(rgba);
    }
    let response = color_dialog.run();
    if (response === Gtk.ResponseType.CANCEL) {
        color_dialog.destroy();
    }
    else if (response === Gtk.ResponseType.OK) {
        popshell_settings.set_string("hint-color-rgba", color_dialog.get_rgba().to_string());
        Gio.Settings.sync();
        color_dialog.destroy();
    }
}
Gtk.init(null);
launch_color_dialog();
