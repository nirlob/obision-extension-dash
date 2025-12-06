import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Helper function to create a color picker with popover (no modal dialog)
function createColorPicker(settings, settingKey) {
    const button = new Gtk.MenuButton({
        valign: Gtk.Align.CENTER,
    });

    // Create a drawing area to show the current color
    const colorPreview = new Gtk.DrawingArea({
        width_request: 24,
        height_request: 24,
    });

    // Parse color and draw
    const updatePreview = () => {
        const colorStr = settings.get_string(settingKey);
        const rgba = new Gdk.RGBA();
        rgba.parse(colorStr);
        // Force opaque
        rgba.alpha = 1.0;

        colorPreview.set_draw_func((area, cr, width, height) => {
            // Draw color rectangle
            cr.setSourceRGBA(rgba.red, rgba.green, rgba.blue, 1.0);
            cr.rectangle(0, 0, width, height);
            cr.fill();
            // Draw border
            cr.setSourceRGBA(0.5, 0.5, 0.5, 1.0);
            cr.setLineWidth(1);
            cr.rectangle(0.5, 0.5, width - 1, height - 1);
            cr.stroke();
        });
        colorPreview.queue_draw();
    };

    updatePreview();
    button.set_child(colorPreview);

    // Create popover with color chooser widget
    const popover = new Gtk.Popover();
    const colorChooser = new Gtk.ColorChooserWidget({
        show_editor: true,
        use_alpha: false,
    });

    // Set initial color
    const initialColor = settings.get_string(settingKey);
    const rgba = new Gdk.RGBA();
    if (rgba.parse(initialColor)) {
        rgba.alpha = 1.0;
        colorChooser.set_rgba(rgba);
    }

    // Create a box with the color chooser and an apply button
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        margin_top: 8,
        margin_bottom: 8,
        margin_start: 8,
        margin_end: 8,
    });

    box.append(colorChooser);

    const applyButton = new Gtk.Button({
        label: 'Apply',
        css_classes: ['suggested-action'],
    });

    applyButton.connect('clicked', () => {
        const newColor = colorChooser.get_rgba();
        // Force opaque color (no alpha)
        const opaqueColor = `rgb(${Math.round(newColor.red * 255)},${Math.round(newColor.green * 255)},${Math.round(newColor.blue * 255)})`;
        settings.set_string(settingKey, opaqueColor);
        updatePreview();
        popover.popdown();
    });

    box.append(applyButton);
    popover.set_child(box);
    button.set_popover(popover);

    return button;
}

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
                title: 'Panel Size',
                subtitle: 'Size of the panel in pixels',
                adjustment: new Gtk.Adjustment({
                    lower: 40,
                    upper: 200,
                    step_increment: 1,
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
                    step_increment: 1,
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

            // Background opacity (only when transparent is active)
            const opacityRow = new Adw.SpinRow({
                title: 'Background Opacity',
                subtitle: 'Opacity of the transparent background (0-100%)',
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 100,
                    step_increment: 1,
                }),
            });

            settings.bind(
                'background-opacity',
                opacityRow,
                'value',
                Gio.SettingsBindFlags.DEFAULT
            );

            backgroundGroup.add(opacityRow);

            // Background color with color button
            const bgColorRow = new Adw.ActionRow({
                title: 'Background Color',
                subtitle: 'Solid background color for the panel',
            });

            const colorButton = createColorPicker(settings, 'background-color');
            bgColorRow.add_suffix(colorButton);
            bgColorRow.activatable_widget = colorButton;
            backgroundGroup.add(bgColorRow);

            // Bind sensitivity: toggle between opacity and color based on transparent switch
            const updateBackgroundSensitivity = () => {
                const isTransparent = transparentBgRow.active;
                opacityRow.sensitive = isTransparent;
                bgColorRow.sensitive = !isTransparent;
            };

            transparentBgRow.connect('notify::active', updateBackgroundSensitivity);

            // Set initial sensitivity
            updateBackgroundSensitivity();

            // Separator group
            const separatorGroup = new Adw.PreferencesGroup({
                title: 'Separator',
                description: 'Line between panel and desktop',
            });
            this.add(separatorGroup);

            // Separator visible
            const separatorVisibleRow = new Adw.SwitchRow({
                title: 'Visible',
                subtitle: 'Show separator line between panel and desktop',
            });

            settings.bind(
                'panel-separator-visible',
                separatorVisibleRow,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );

            separatorGroup.add(separatorVisibleRow);

            // Separator color
            const separatorColorRow = new Adw.ActionRow({
                title: 'Color',
                subtitle: 'Color of the separator line',
            });

            const sepColorButton = createColorPicker(settings, 'panel-separator-color');
            separatorColorRow.add_suffix(sepColorButton);
            separatorColorRow.activatable_widget = sepColorButton;
            separatorGroup.add(separatorColorRow);

            // Bind sensitivity of separator options to visible switch
            const updateSeparatorSensitivity = () => {
                const isVisible = separatorVisibleRow.active;
                separatorColorRow.sensitive = isVisible;
            };

            separatorVisibleRow.connect('notify::active', updateSeparatorSensitivity);
            updateSeparatorSensitivity();
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

            // Show Desktop group
            const showDesktopGroup = new Adw.PreferencesGroup({
                title: 'Show Desktop',
                description: 'Configure Show Desktop button',
            });
            this.add(showDesktopGroup);

            // Show Desktop button width
            const showDesktopWidthRow = new Adw.SpinRow({
                title: 'Button Width',
                subtitle: 'Width of the Show Desktop button in pixels',
                adjustment: new Gtk.Adjustment({
                    lower: 1,
                    upper: 20,
                    step_increment: 1,
                }),
            });

            settings.bind(
                'show-desktop-button-width',
                showDesktopWidthRow,
                'value',
                Gio.SettingsBindFlags.DEFAULT
            );

            showDesktopGroup.add(showDesktopWidthRow);

            // Show Desktop button margin
            const showDesktopMarginRow = new Adw.SpinRow({
                title: 'Margin',
                subtitle: 'Margin between button and system icons',
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 20,
                    step_increment: 1,
                }),
            });

            settings.bind(
                'show-desktop-button-margin',
                showDesktopMarginRow,
                'value',
                Gio.SettingsBindFlags.DEFAULT
            );

            showDesktopGroup.add(showDesktopMarginRow);
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

            const iconColorButton = createColorPicker(settings, 'icon-background-color');
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

            // Normal show border switch
            const normalShowBorderRow = new Adw.SwitchRow({
                title: 'Normal Show Border',
                subtitle: 'Display border around icon backgrounds in normal state',
            });

            settings.bind(
                'icon-normal-show-border',
                normalShowBorderRow,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );

            bordersGroup.add(normalShowBorderRow);

            // Normal border color with color button
            const normalBorderColorRow = new Adw.ActionRow({
                title: 'Normal Border Color',
                subtitle: 'Color for icon borders in normal state',
            });

            const normalBorderColorButton = createColorPicker(settings, 'icon-normal-border-color');
            normalBorderColorRow.add_suffix(normalBorderColorButton);
            normalBorderColorRow.activatable_widget = normalBorderColorButton;
            bordersGroup.add(normalBorderColorRow);

            // Bind normal border color row sensitivity to show border switch
            normalShowBorderRow.bind_property(
                'active',
                normalBorderColorRow,
                'sensitive',
                GObject.BindingFlags.SYNC_CREATE
            );

            // Hover show border switch
            const hoverShowBorderRow = new Adw.SwitchRow({
                title: 'Hover Show Border',
                subtitle: 'Display border around icon backgrounds in hover state',
            });

            settings.bind(
                'icon-hover-show-border',
                hoverShowBorderRow,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );

            bordersGroup.add(hoverShowBorderRow);

            // Hover border color
            const hoverBorderColorRow = new Adw.ActionRow({
                title: 'Hover Border Color',
                subtitle: 'Color for icon borders in hover state',
            });

            const hoverBorderColorButton = createColorPicker(settings, 'icon-hover-border-color');
            hoverBorderColorRow.add_suffix(hoverBorderColorButton);
            hoverBorderColorRow.activatable_widget = hoverBorderColorButton;
            bordersGroup.add(hoverBorderColorRow);

            hoverShowBorderRow.bind_property(
                'active',
                hoverBorderColorRow,
                'sensitive',
                GObject.BindingFlags.SYNC_CREATE
            );

            // Selected show border switch
            const selectedShowBorderRow = new Adw.SwitchRow({
                title: 'Selected Show Border',
                subtitle: 'Display border around icon backgrounds in selected state',
            });

            settings.bind(
                'icon-selected-show-border',
                selectedShowBorderRow,
                'active',
                Gio.SettingsBindFlags.DEFAULT
            );

            bordersGroup.add(selectedShowBorderRow);

            // Selected border color
            const selectedBorderColorRow = new Adw.ActionRow({
                title: 'Selected Border Color',
                subtitle: 'Color for icon borders in selected state',
            });

            const selectedBorderColorButton = createColorPicker(settings, 'icon-selected-border-color');
            selectedBorderColorRow.add_suffix(selectedBorderColorButton);
            selectedBorderColorRow.activatable_widget = selectedBorderColorButton;
            bordersGroup.add(selectedBorderColorRow);

            selectedShowBorderRow.bind_property(
                'active',
                selectedBorderColorRow,
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
