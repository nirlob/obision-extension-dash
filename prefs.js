import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
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

        // Background group
        const backgroundGroup = new Adw.PreferencesGroup({
            title: 'Background',
            description: 'Configure panel background',
        });
        this.add(backgroundGroup);

        // Transparent background switch
        const transparentBgRow = new Adw.SwitchRow({
            title: 'Transparent Background',
            subtitle: 'Make panel background transparent',
        });
        
        settings.bind(
            'transparent-background',
            transparentBgRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        backgroundGroup.add(transparentBgRow);

        // Background color with color button
        const bgColorRow = new Adw.ActionRow({
            title: 'Background Color',
            subtitle: 'Solid background color for the panel',
        });
        
        // Create a button with a colored box
        const colorButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            has_frame: true,
            width_request: 40,
            height_request: 40,
        });
        
        // Create a box to show the current color
        const colorBox = new Gtk.Box({
            width_request: 32,
            height_request: 32,
            css_classes: ['color-preview'],
        });
        colorButton.set_child(colorBox);
        
        // Parse initial color from settings
        const colorString = settings.get_string('background-color');
        const rgba = new Gdk.RGBA();
        if (rgba.parse(colorString)) {
            colorBox.set_css_classes(['color-preview']);
            const css = `
                .color-preview {
                    background-color: ${colorString};
                    border-radius: 4px;
                }
            `;
            const cssProvider = new Gtk.CssProvider();
            cssProvider.load_from_data(css, -1);
            colorBox.get_style_context().add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
        
        // Create color chooser dialog
        const colorChooser = new Gtk.ColorChooserDialog({
            title: 'Choose Background Color',
            modal: true,
            use_alpha: true,
        });
        
        if (rgba.parse(colorString)) {
            colorChooser.set_rgba(rgba);
        }
        
        // Connect button click to show color chooser
        colorButton.connect('clicked', () => {
            colorChooser.set_transient_for(colorButton.get_root());
            colorChooser.show();
        });
        
        // Connect to color changes in the dialog
        colorChooser.connect('response', (dialog, response) => {
            if (response === Gtk.ResponseType.OK) {
                const newColor = colorChooser.get_rgba();
                const colorStr = newColor.to_string();
                settings.set_string('background-color', colorStr);
                
                // Update the color box
                const css = `
                    .color-preview {
                        background-color: ${colorStr};
                        border-radius: 4px;
                    }
                `;
                const cssProvider = new Gtk.CssProvider();
                cssProvider.load_from_data(css, -1);
                colorBox.get_style_context().add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            }
            dialog.hide();
        });
        
        bgColorRow.add_suffix(colorButton);
        bgColorRow.activatable_widget = colorButton;
        backgroundGroup.add(bgColorRow);

        // Bind sensitivity: disable color picker when transparent is active
        transparentBgRow.connect('notify::active', () => {
            bgColorRow.sensitive = !transparentBgRow.active;
        });
        
        // Set initial sensitivity
        bgColorRow.sensitive = !settings.get_boolean('transparent-background');
    }
});

// Dash Panel Settings Page
const DashPanelSettingsPage = GObject.registerClass(
class DashPanelSettingsPage extends Adw.PreferencesPage {
    constructor(settings) {
        super({
            title: 'Dash panel',
            icon_name: 'view-app-grid-symbolic',
        });

        // Applications Button group
        const appsButtonGroup = new Adw.PreferencesGroup({
            title: 'Applications Button',
            description: 'Configure Show Applications button',
        });
        this.add(appsButtonGroup);

        // Show separator
        const showSeparatorRow = new Adw.SwitchRow({
            title: 'Show Separator',
            subtitle: 'Display separator after the Show Applications button',
        });
        
        settings.bind(
            'show-apps-separator',
            showSeparatorRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        appsButtonGroup.add(showSeparatorRow);

        // Separator width
        const separatorWidthRow = new Adw.SpinRow({
            title: 'Separator Width',
            subtitle: 'Width of the separator line in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 10,
                step_increment: 1,
            }),
        });
        
        settings.bind(
            'separator-width',
            separatorWidthRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        appsButtonGroup.add(separatorWidthRow);

        // Bind separator width sensitivity to show separator
        showSeparatorRow.connect('notify::active', () => {
            separatorWidthRow.sensitive = showSeparatorRow.active;
        });
        
        // Set initial sensitivity
        separatorWidthRow.sensitive = settings.get_boolean('show-apps-separator');
    }
});

// System Panel Settings Page
const SystemPanelSettingsPage = GObject.registerClass(
class SystemPanelSettingsPage extends Adw.PreferencesPage {
    constructor(settings) {
        super({
            title: 'System panel',
            icon_name: 'preferences-system-symbolic',
        });

        // Date Panel group (first position)
        const datePanelGroup = new Adw.PreferencesGroup({
            title: 'Date Panel',
            description: 'Configure date panel position and spacing',
        });
        this.add(datePanelGroup);

        // Date position
        const datePositionRow = new Adw.ComboRow({
            title: 'Date Position',
            subtitle: 'Where to display the date in the top bar',
        });
        
        const positionModel = new Gtk.StringList();
        positionModel.append('Left');
        positionModel.append('Down');
        datePositionRow.model = positionModel;
        
        const positions = ['left', 'down'];
        const currentDatePosition = settings.get_string('date-position');
        const selectedIndex = positions.indexOf(currentDatePosition);
        datePositionRow.selected = selectedIndex >= 0 ? selectedIndex : 0;
        
        datePositionRow.connect('notify::selected', (widget) => {
            settings.set_string('date-position', positions[widget.selected]);
        });
        
        datePanelGroup.add(datePositionRow);

        // Date spacing
        const dateSpacingRow = new Adw.SpinRow({
            title: 'Separation pixels',
            subtitle: 'Space between icons and date in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 50,
                step_increment: 1,
            }),
        });
        
        settings.bind(
            'date-spacing',
            dateSpacingRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        datePanelGroup.add(dateSpacingRow);

        // Time group
        const timeGroup = new Adw.PreferencesGroup({
            title: 'Time',
            description: 'Configure time display',
        });
        this.add(timeGroup);

        // Time visibility
        const timeVisibleRow = new Adw.ActionRow({
            title: 'Show time',
            subtitle: 'Display the time in the panel',
        });
        
        const timeVisibleSwitch = new Gtk.Switch({
            active: settings.get_boolean('time-visible'),
            valign: Gtk.Align.CENTER,
        });
        
        settings.bind(
            'time-visible',
            timeVisibleSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        timeVisibleRow.add_suffix(timeVisibleSwitch);
        timeVisibleRow.activatable_widget = timeVisibleSwitch;
        timeGroup.add(timeVisibleRow);

        // Time font size
        const timeFontSizeRow = new Adw.SpinRow({
            title: 'Font size',
            subtitle: 'Size of time text',
            adjustment: new Gtk.Adjustment({
                lower: 8,
                upper: 30,
                step_increment: 1,
            }),
        });
        
        settings.bind(
            'time-font-size',
            timeFontSizeRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        timeGroup.add(timeFontSizeRow);
        
        // Time font bold
        const timeFontBoldRow = new Adw.ActionRow({
            title: 'Bold text',
            subtitle: 'Make time text bold',
        });
        
        const timeFontBoldSwitch = new Gtk.Switch({
            active: settings.get_boolean('time-font-bold'),
            valign: Gtk.Align.CENTER,
        });
        
        settings.bind(
            'time-font-bold',
            timeFontBoldSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        timeFontBoldRow.add_suffix(timeFontBoldSwitch);
        timeFontBoldRow.set_activatable_widget(timeFontBoldSwitch);
        timeGroup.add(timeFontBoldRow);

        // Bind time options sensitivity to time visibility
        const updateTimeSensitivity = () => {
            const visible = settings.get_boolean('time-visible');
            timeFontSizeRow.sensitive = visible;
            timeFontBoldRow.sensitive = visible;
        };
        
        timeVisibleSwitch.connect('notify::active', updateTimeSensitivity);
        updateTimeSensitivity();

        // Date group
        const dateGroup = new Adw.PreferencesGroup({
            title: 'Date',
            description: 'Configure date display',
        });
        this.add(dateGroup);

        // Date visibility
        const dateVisibleRow = new Adw.ActionRow({
            title: 'Show date',
            subtitle: 'Display the date in the panel',
        });
        
        const dateVisibleSwitch = new Gtk.Switch({
            active: settings.get_boolean('date-visible'),
            valign: Gtk.Align.CENTER,
        });
        
        settings.bind(
            'date-visible',
            dateVisibleSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        dateVisibleRow.add_suffix(dateVisibleSwitch);
        dateVisibleRow.activatable_widget = dateVisibleSwitch;
        dateGroup.add(dateVisibleRow);

        // Date font size
        const dateFontSizeRow = new Adw.SpinRow({
            title: 'Font size',
            subtitle: 'Size of date text',
            adjustment: new Gtk.Adjustment({
                lower: 8,
                upper: 30,
                step_increment: 1,
            }),
        });
        
        settings.bind(
            'date-font-size',
            dateFontSizeRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        dateGroup.add(dateFontSizeRow);
        
        // Date font bold
        const dateFontBoldRow = new Adw.ActionRow({
            title: 'Bold text',
            subtitle: 'Make date text bold',
        });
        
        const dateFontBoldSwitch = new Gtk.Switch({
            active: settings.get_boolean('date-font-bold'),
            valign: Gtk.Align.CENTER,
        });
        
        settings.bind(
            'date-font-bold',
            dateFontBoldSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        dateFontBoldRow.add_suffix(dateFontBoldSwitch);
        dateFontBoldRow.set_activatable_widget(dateFontBoldSwitch);
        dateGroup.add(dateFontBoldRow);

        // Date show year
        const dateShowYearRow = new Adw.ActionRow({
            title: 'Show year',
            subtitle: 'Display the year in the date',
        });
        
        const dateShowYearSwitch = new Gtk.Switch({
            active: settings.get_boolean('date-show-year'),
            valign: Gtk.Align.CENTER,
        });
        
        settings.bind(
            'date-show-year',
            dateShowYearSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        dateShowYearRow.add_suffix(dateShowYearSwitch);
        dateShowYearRow.set_activatable_widget(dateShowYearSwitch);
        dateGroup.add(dateShowYearRow);

        // Bind date options sensitivity to date visibility
        const updateDateSensitivity = () => {
            const visible = settings.get_boolean('date-visible');
            dateFontSizeRow.sensitive = visible;
            dateFontBoldRow.sensitive = visible;
            dateShowYearRow.sensitive = visible;
        };
        
        dateVisibleSwitch.connect('notify::active', updateDateSensitivity);
        updateDateSensitivity();

        // Icons group
        const iconsGroup = new Adw.PreferencesGroup({
            title: 'Icons',
            description: 'Configure system panel icons',
        });
        this.add(iconsGroup);

        // Icon size
        const iconSizeRow = new Adw.SpinRow({
            title: 'Icon Size',
            subtitle: 'Size of system panel icons in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 12,
                upper: 32,
                step_increment: 1,
            }),
        });
        
        settings.bind(
            'system-icon-size',
            iconSizeRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        iconsGroup.add(iconSizeRow);

        // Icon margins
        const iconMarginsRow = new Adw.SpinRow({
            title: 'Margins',
            subtitle: 'Applied to left and right of each icon',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 20,
                step_increment: 1,
            }),
        });
        
        settings.bind(
            'system-icon-margins',
            iconMarginsRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        iconsGroup.add(iconMarginsRow);
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
                step_increment: 1,
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

        // Icon group
        const iconPanelGroup = new Adw.PreferencesGroup({
            title: 'Icon',
            description: 'Configure icon appearance and styling',
        });
        this.add(iconPanelGroup);

        // Icon size multiplier
        const iconSizeRow = new Adw.SpinRow({
            title: 'Size',
            subtitle: 'Icon size multiplier (1-8, where 7 = 0.7)',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 8,
                step_increment: 1,
            }),
        });
        
        settings.bind(
            'icon-size-multiplier',
            iconSizeRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        iconPanelGroup.add(iconSizeRow);

        // Use main panel background color
        const useMainBgRow = new Adw.SwitchRow({
            title: 'Use Main Panel Background Color',
            subtitle: 'Use the same background color as the main panel',
        });
        
        settings.bind(
            'icon-use-main-bg-color',
            useMainBgRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        iconPanelGroup.add(useMainBgRow);

        // Icon background color with color button
        const iconBgColorRow = new Adw.ActionRow({
            title: 'Background Color',
            subtitle: 'Custom background color for icons',
        });
        
        // Create a button with a colored box
        const iconColorButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            has_frame: true,
            width_request: 40,
            height_request: 40,
        });
        
        // Create a box to show the current color
        const iconColorBox = new Gtk.Box({
            width_request: 32,
            height_request: 32,
            css_classes: ['icon-color-preview'],
        });
        iconColorButton.set_child(iconColorBox);
        
        // Parse initial color from settings
        const iconColorString = settings.get_string('icon-background-color');
        const iconRgba = new Gdk.RGBA();
        if (iconRgba.parse(iconColorString)) {
            iconColorBox.set_css_classes(['icon-color-preview']);
            const css = `
                .icon-color-preview {
                    background-color: ${iconColorString};
                    border-radius: 4px;
                }
            `;
            const cssProvider = new Gtk.CssProvider();
            cssProvider.load_from_data(css, -1);
            iconColorBox.get_style_context().add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
        
        // Create color chooser dialog
        const iconColorChooser = new Gtk.ColorChooserDialog({
            title: 'Choose Icon Background Color',
            modal: true,
            use_alpha: true,
        });
        
        if (iconRgba.parse(iconColorString)) {
            iconColorChooser.set_rgba(iconRgba);
        }
        
        // Connect button click to show color chooser
        iconColorButton.connect('clicked', () => {
            iconColorChooser.set_transient_for(iconColorButton.get_root());
            iconColorChooser.show();
        });
        
        // Connect to color changes in the dialog
        iconColorChooser.connect('response', (dialog, response) => {
            if (response === Gtk.ResponseType.OK) {
                const newColor = iconColorChooser.get_rgba();
                const colorStr = newColor.to_string();
                settings.set_string('icon-background-color', colorStr);
                
                // Update the color box
                const css = `
                    .icon-color-preview {
                        background-color: ${colorStr};
                        border-radius: 4px;
                    }
                `;
                const cssProvider = new Gtk.CssProvider();
                cssProvider.load_from_data(css, -1);
                iconColorBox.get_style_context().add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            }
            dialog.hide();
        });
        
        iconBgColorRow.add_suffix(iconColorButton);
        iconBgColorRow.activatable_widget = iconColorButton;
        iconPanelGroup.add(iconBgColorRow);

        // Bind sensitivity: disable color picker when use main bg color is active
        useMainBgRow.connect('notify::active', () => {
            iconBgColorRow.sensitive = !useMainBgRow.active;
        });
        
        // Set initial sensitivity
        iconBgColorRow.sensitive = !settings.get_boolean('icon-use-main-bg-color');

        // Borders group
        const bordersGroup = new Adw.PreferencesGroup({
            title: 'Borders',
            description: 'Configure icon borders and corner radius',
        });
        this.add(bordersGroup);

        // Corner radius
        const cornerRadiusRow = new Adw.SpinRow({
            title: 'Corner Round',
            subtitle: 'Radius for icon background corners in pixels',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 50,
                step_increment: 1,
            }),
        });
        
        settings.bind(
            'icon-corner-radius',
            cornerRadiusRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        bordersGroup.add(cornerRadiusRow);

        // Show border switch
        const showBorderRow = new Adw.SwitchRow({
            title: 'Show Border',
            subtitle: 'Display border around icon backgrounds',
        });
        
        settings.bind(
            'icon-show-border',
            showBorderRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        
        bordersGroup.add(showBorderRow);

        // Border color with color button
        const borderColorRow = new Adw.ActionRow({
            title: 'Border Color',
            subtitle: 'Color for icon borders',
        });
        
        const borderColorButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            has_frame: true,
            width_request: 40,
            height_request: 40,
        });
        
        const borderColorBox = new Gtk.Box({
            width_request: 32,
            height_request: 32,
            css_classes: ['border-color-preview'],
        });
        borderColorButton.set_child(borderColorBox);
        
        const borderColorString = settings.get_string('icon-border-color');
        const borderRgba = new Gdk.RGBA();
        if (borderRgba.parse(borderColorString)) {
            const borderCss = `
                .border-color-preview {
                    background-color: ${borderColorString};
                    border-radius: 4px;
                }
            `;
            const borderCssProvider = new Gtk.CssProvider();
            borderCssProvider.load_from_data(borderCss, -1);
            borderColorBox.get_style_context().add_provider(borderCssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
        
        const borderColorChooser = new Gtk.ColorChooserDialog({
            title: 'Choose Border Color',
            modal: true,
            use_alpha: true,
        });
        
        if (borderRgba.parse(borderColorString)) {
            borderColorChooser.set_rgba(borderRgba);
        }
        
        borderColorButton.connect('clicked', () => {
            borderColorChooser.set_transient_for(borderColorButton.get_root());
            borderColorChooser.show();
        });
        
        borderColorChooser.connect('response', (dialog, response) => {
            if (response === Gtk.ResponseType.OK) {
                const newColor = borderColorChooser.get_rgba();
                const colorStr = newColor.to_string();
                settings.set_string('icon-border-color', colorStr);
                
                const css = `
                    .border-color-preview {
                        background-color: ${colorStr};
                        border-radius: 4px;
                    }
                `;
                const cssProvider = new Gtk.CssProvider();
                cssProvider.load_from_data(css, -1);
                borderColorBox.get_style_context().add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            }
            dialog.hide();
        });
        
        borderColorRow.add_suffix(borderColorButton);
        borderColorRow.activatable_widget = borderColorButton;
        bordersGroup.add(borderColorRow);
        
        // Bind border color row sensitivity to show border switch
        showBorderRow.bind_property(
            'active',
            borderColorRow,
            'sensitive',
            GObject.BindingFlags.SYNC_CREATE
        );
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

        const dashPanelPage = new DashPanelSettingsPage(settings);
        window.add(dashPanelPage);

        const systemPanelPage = new SystemPanelSettingsPage(settings);
        window.add(systemPanelPage);
    }
}
