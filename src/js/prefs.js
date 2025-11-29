import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Panel Settings Page
const PanelSettingsPage = GObject.registerClass(
class PanelSettingsPage extends Adw.PreferencesPage {
    constructor(settings) {
        super({
            title: 'Panel',
            icon_name: 'view-grid-symbolic',
        });

        this._settings = settings;

        // Position group
        const positionGroup = new Adw.PreferencesGroup({
            title: 'Position',
            description: 'Configure panel position',
        });
        this.add(positionGroup);

        // Panel position
        const positionRow = new Adw.ComboRow({
            title: 'Panel Position',
            subtitle: 'Where to place the panel',
        });
        
        const positionModel = new Gtk.StringList();
        positionModel.append('Left');
        positionModel.append('Right');
        positionModel.append('Top');
        positionModel.append('Bottom');
        positionRow.model = positionModel;
        
        const positions = ['LEFT', 'RIGHT', 'TOP', 'BOTTOM'];
        const currentPosition = settings.get_string('dash-position');
        positionRow.selected = positions.indexOf(currentPosition);
        
        positionRow.connect('notify::selected', (widget) => {
            settings.set_string('dash-position', positions[widget.selected]);
        });
        
        positionGroup.add(positionRow);

        // Size group
        const sizeGroup = new Adw.PreferencesGroup({
            title: 'Size',
            description: 'Configure panel dimensions',
        });
        this.add(sizeGroup);

        // Panel size
        const sizeRow = new Adw.SpinRow({
            title: 'Panel Height',
            subtitle: 'Height of the panel in pixels (width is always 100%)',
            adjustment: new Gtk.Adjustment({
                lower: 40,
                upper: 200,
                step_increment: 4,
            }),
        });
        
        settings.bind(
            'dash-size',
            sizeRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        sizeGroup.add(sizeRow);

        // Panel padding
        const paddingRow = new Adw.SpinRow({
            title: 'Panel Padding',
            subtitle: 'Space between panel edge and content in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 32,
                step_increment: 2,
            }),
        });
        
        settings.bind(
            'panel-padding',
            paddingRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        sizeGroup.add(paddingRow);

        // Behavior group
        const behaviorGroup = new Adw.PreferencesGroup({
            title: 'Behavior',
            description: 'Configure panel behavior',
        });
        this.add(behaviorGroup);

        // Auto-hide
        const autoHideRow = new Adw.SwitchRow({
            title: 'Auto-hide',
            subtitle: 'Hide panel when not in use',
        });
        
        settings.bind(
            'auto-hide',
            autoHideRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        behaviorGroup.add(autoHideRow);
    }
});

// Icons Settings Page
const IconsSettingsPage = GObject.registerClass(
class IconsSettingsPage extends Adw.PreferencesPage {
    constructor(settings) {
        super({
            title: 'Icons',
            icon_name: 'applications-graphics-symbolic',
        });

        // Spacing group
        const spacingGroup = new Adw.PreferencesGroup({
            title: 'Spacing',
            description: 'Configure icon spacing',
        });
        this.add(spacingGroup);

        // Icon spacing
        const iconSpacingRow = new Adw.SpinRow({
            title: 'Icon Spacing',
            subtitle: 'Space between icons in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 32,
                step_increment: 2,
            }),
        });
        
        // Set initial value from settings
        iconSpacingRow.value = settings.get_int('icon-spacing');
        
        settings.bind(
            'icon-spacing',
            iconSpacingRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        spacingGroup.add(iconSpacingRow);
    }
});

export default class ObisionExtensionDashPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.obision-extension-dash');

        // Add pages
        const panelPage = new PanelSettingsPage(settings);
        window.add(panelPage);

        const iconsPage = new IconsSettingsPage(settings);
        window.add(iconsPage);
    }
}
