import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import St from 'gi://St';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export default class ObisionExtensionDash extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settings = null;
        this._originalDashParent = null;
        this._originalDashIndex = null;
        this._dash = null;
        this._panel = null;
        this._topBarContainer = null;
        this._originalTopPanelParent = null;
        this._topPanel = null;
        this._menu = null;
        this._panelButtonPressId = null;
        this._stageButtonPressId = null;
        this._dateMenu = null;
        this._originalDateMenuParent = null;
        this._originalDateMenuIndex = null;
        this._originalDateMenuStyle = null;
        this._dateVerticalContainer = null;
        this._iconsHorizontalBox = null;
        this._originalRightBoxChildren = null;
        this._originalLeftBoxWidth = null;
        this._originalCenterBoxParent = null;
        this._originalRightBoxParent = null;
        this._originalRightBoxStyle = null;
        this._clockNotifyId = null;
        this._clockLabel = null;
        this._customClockContainer = null;
        this._customTimeLabel = null;
        this._customDateLabel = null;
        this._showAppsSeparator = null;
        this._runningSeparator = null;
        this._iconStyleProvider = null;
        this._overviewShowingId = null;
        this._overviewHidingId = null;
        this._dashBoxNotifyVisibleId = null;
        this._dashBoxNotifyOpacityId = null;
        this._visibilityCheckId = null;
        this._startupCompleteId = null;
        // Auto-hide
        this._autoHideEnabled = false;
        this._panelHidden = false;
        this._autoHideTimeoutId = null;
        this._panelEnterId = null;
        this._panelLeaveId = null;
        this._hoverZone = null;
        // Show desktop button
        this._showDesktopButton = null;
        // New: our own app icons
        this._appIconsBox = null;
        this._appIcons = [];
        this._appSystem = null;
        this._favoritesChangedId = null;
        this._appStateChangedId = null;
        this._showAppsButton = null;
    }

    enable() {
        log('Obision Extension Dash enabling - checking shell state');

        this._settings = this.getSettings();
        this._enableTimestamp = Date.now();

        // Check if shell is fully loaded, if not, wait
        const overviewExists = Main.overview !== undefined && Main.overview !== null;
        const dashExists = overviewExists && Main.overview.dash !== undefined && Main.overview.dash !== null;

        log(`Shell state: overview=${overviewExists}, dash=${dashExists}`);

        if (!overviewExists || !dashExists) {
            log('Shell not fully loaded, waiting for startup-complete...');
            this._startupCompleteId = Main.layoutManager.connect('startup-complete', () => {
                log('Startup complete signal received, initializing extension');
                Main.layoutManager.disconnect(this._startupCompleteId);
                this._startupCompleteId = null;
                this._initExtension();
            });
            return;
        }

        log('Shell already loaded, initializing immediately');
        this._initExtension();
    }

    _initExtension() {
        log('_initExtension called');

        // Get the native dash from overview (we'll hide it, not move it)
        this._dash = Main.overview.dash;

        if (!this._dash) {
            log('ERROR: Dash not available after init!');
            return;
        }

        // Hide the original dash in overview instead of moving it
        this._dash.hide();

        // Get app system for tracking running apps
        this._appSystem = Shell.AppSystem.get_default();

        // Create main panel container
        this._panel = new St.BoxLayout({
            name: 'obision-panel',
            style_class: 'obision-panel',
            reactive: true,
            track_hover: true,
            clip_to_allocation: true,
            style: 'spacing: 0px;',
        });

        // Apply initial background style
        this._updatePanelBackground();

        // Create scroll container for app icons
        this._scrollContainer = new St.BoxLayout({
            name: 'obision-scroll-container',
            vertical: false,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: true,
        });

        // Create scroll button (previous/up)
        this._scrollPrevButton = new St.Button({
            style_class: 'scroll-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            visible: false,
            x_expand: false,
            y_expand: false,
        });
        this._scrollPrevIcon = new St.Icon({
            icon_name: 'pan-start-symbolic',
            icon_size: 12,
        });
        this._scrollPrevButton.set_child(this._scrollPrevIcon);
        // Use button-press-event to ensure we capture the click
        this._scrollPrevButton.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this._scrollIcons(-1);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._scrollPrevButton.connect('enter-event', () => {
            if (this._scrollPrevButton._hoverStyle) {
                this._scrollPrevButton.set_style(this._scrollPrevButton._hoverStyle);
            }
        });
        this._scrollPrevButton.connect('leave-event', () => {
            if (this._scrollPrevButton._normalStyle) {
                this._scrollPrevButton.set_style(this._scrollPrevButton._normalStyle);
            }
        });

        // Create ScrollView for icons
        this._scrollView = new St.ScrollView({
            style_class: 'obision-scroll-view',
            x_expand: true,
            y_expand: true,
            overlay_scrollbars: true,
            enable_mouse_scrolling: true,
        });
        // Hide scrollbars - we use buttons instead
        this._scrollView.set_policy(St.PolicyType.EXTERNAL, St.PolicyType.EXTERNAL);

        // Connect to scroll events to update button visibility
        this._scrollView.connect('scroll-event', () => {
            this._updateScrollButtonsVisibility();
            return Clutter.EVENT_PROPAGATE;
        });

        // Create app icons box (inside scroll view)
        this._appIconsBox = new St.BoxLayout({
            name: 'obision-app-icons',
            style_class: 'obision-dash-container',
            vertical: false,
            x_expand: false,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: false,
        });

        this._scrollView.add_child(this._appIconsBox);

        // Create scroll button (next/down)
        this._scrollNextButton = new St.Button({
            style_class: 'scroll-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            visible: false,
            x_expand: false,
            y_expand: false,
        });
        this._scrollNextIcon = new St.Icon({
            icon_name: 'pan-end-symbolic',
            icon_size: 12,
        });
        this._scrollNextButton.set_child(this._scrollNextIcon);
        // Use button-press-event to ensure we capture the click
        this._scrollNextButton.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this._scrollIcons(1);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._scrollNextButton.connect('enter-event', () => {
            if (this._scrollNextButton._hoverStyle) {
                this._scrollNextButton.set_style(this._scrollNextButton._hoverStyle);
            }
        });
        this._scrollNextButton.connect('leave-event', () => {
            if (this._scrollNextButton._normalStyle) {
                this._scrollNextButton.set_style(this._scrollNextButton._normalStyle);
            }
        });

        // Add scroll buttons and scroll view to container
        this._scrollContainer.add_child(this._scrollPrevButton);
        this._scrollContainer.add_child(this._scrollView);
        this._scrollContainer.add_child(this._scrollNextButton);

        // Create container for Show Apps button (outside scroll)
        this._showAppsContainer = new St.BoxLayout({
            name: 'obision-show-apps-container',
            vertical: false,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Create top-bar container (shrinks to fit content)
        this._topBarContainer = new St.BoxLayout({
            name: 'obision-topbar-container',
            style_class: 'obision-topbar-container',
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Get and move the top panel
        this._topPanel = Main.panel;
        this._originalTopPanelParent = this._topPanel.get_parent();

        if (this._originalTopPanelParent) {
            this._originalTopPanelParent.remove_child(this._topPanel);
        }

        // Hide the original panel container space
        if (Main.layoutManager.panelBox) {
            Main.layoutManager.panelBox.hide();
        }

        // Hide the Activities button
        if (this._topPanel.statusArea.activities) {
            this._topPanel.statusArea.activities.container.hide();
        }

        // Make left box invisible and take no space
        if (this._topPanel._leftBox) {
            this._originalLeftBoxWidth = this._topPanel._leftBox.width;
            this._topPanel._leftBox.set_width(0);
            this._topPanel._leftBox.hide();
        }

        // Configure top panel to use natural width (content size)
        this._topPanel.x_expand = false;
        this._topPanel.natural_width_set = false;

        // Remove spacing between panel components
        this._topPanel.set_style('spacing: 0px;');

        // Extract centerBox and rightBox from the panel
        if (this._topPanel._centerBox) {
            this._originalCenterBoxParent = this._topPanel._centerBox.get_parent();
            if (this._originalCenterBoxParent) {
                this._originalCenterBoxParent.remove_child(this._topPanel._centerBox);
            }
            this._topBarContainer.add_child(this._topPanel._centerBox);
        }

        if (this._topPanel._rightBox) {
            this._originalRightBoxParent = this._topPanel._rightBox.get_parent();
            this._originalRightBoxStyle = this._topPanel._rightBox.get_style();
            if (this._originalRightBoxParent) {
                this._originalRightBoxParent.remove_child(this._topPanel._rightBox);
            }
            this._topBarContainer.add_child(this._topPanel._rightBox);
        }

        // Create show desktop button container
        this._showDesktopContainer = new St.BoxLayout({
            name: 'obision-show-desktop-container',
            vertical: false,
            x_expand: false,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.FILL,
        });

        // Create show desktop button
        log('About to create show desktop button');
        try {
            this._createShowDesktopButton();
            log('Show desktop button created successfully');
        } catch (e) {
            log(`ERROR creating show desktop button: ${e.message}`);
        }

        // Add containers to main panel: show apps + scroll container (expands) + show desktop + topbar (shrinks to content)
        this._panel.add_child(this._showAppsContainer);
        this._panel.add_child(this._scrollContainer);
        this._panel.add_child(this._topBarContainer);
        this._panel.add_child(this._showDesktopContainer);

        // Add right-click handler for dash context menu on the panel itself
        this._panel.set_reactive(true);
        this._panel.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 3) { // Right click
                const [x, y] = event.get_coords();

                // Check if click is on any icon
                let clickedOnIcon = false;
                for (const iconContainer of this._appIcons) {
                    const [ix, iy] = iconContainer.get_transformed_position();
                    const [iw, ih] = iconContainer.get_size();
                    if (x >= ix && x <= ix + iw && y >= iy && y <= iy + ih) {
                        clickedOnIcon = true;
                        break;
                    }
                }

                // Check if click is on show apps button
                if (this._showAppsButton && !clickedOnIcon) {
                    const [sx, sy] = this._showAppsButton.get_transformed_position();
                    const [sw, sh] = this._showAppsButton.get_size();
                    if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh) {
                        clickedOnIcon = true;
                    }
                }

                // Check if click is in the topbar area
                if (this._topBarContainer && !clickedOnIcon) {
                    const [tx, ty] = this._topBarContainer.get_transformed_position();
                    const [tw, th] = this._topBarContainer.get_size();
                    if (x >= tx && x <= tx + tw && y >= ty && y <= ty + th) {
                        return Clutter.EVENT_PROPAGATE;
                    }
                }

                if (!clickedOnIcon) {
                    this._showDashContextMenu(actor, event);
                    return Clutter.EVENT_STOP;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // We'll add right-click handler for date/time after dateMenu is available
        // See _setupDateMenuContextMenu() called later

        // Create context menu
        this._createContextMenu();

        // Add panel to stage as chrome (always visible)
        Main.layoutManager.addChrome(this._panel, {
            affectsStruts: true,
            trackFullscreen: true,
        });

        // Position the panel
        this._updatePanelPosition();
        this._updatePanelPadding();

        // Build our own app icons
        this._buildAppIcons();

        // Connect to favorites and app state changes
        this._favoritesChangedId = AppFavorites.getAppFavorites().connect('changed', () => {
            log('Favorites changed, rebuilding icons');
            this._buildAppIcons();
        });

        this._appStateChangedId = this._appSystem.connect('app-state-changed', () => {
            log('App state changed, rebuilding icons');
            this._buildAppIcons();
        });

        // Connect to window focus changes
        this._focusWindowId = global.display.connect('notify::focus-window', () => {
            this._updateFocusedApp();
        });

        // Also track via WindowTracker for better reliability
        this._windowTracker = Shell.WindowTracker.get_default();
        this._focusAppId = this._windowTracker.connect('notify::focus-app', () => {
            this._updateFocusedApp();
        });

        // Connect to overview showing/hiding to update show apps button state
        this._overviewShowingId = Main.overview.connect('showing', () => {
            this._updateShowAppsButtonState(true);
        });

        this._overviewHidingId = Main.overview.connect('hiding', () => {
            this._updateShowAppsButtonState(false);
        });

        // Connect to monitor changes
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._updatePanelPosition();
        });

        // Connect to settings changes
        this._settingsChangedIds = [
            this._settings.connect('changed::dash-position', () => {
                this._updatePanelPosition();
                // Update hover zone position if auto-hide is enabled
                if (this._autoHideEnabled) {
                    this._createHoverZone();
                }
            }),
            this._settings.connect('changed::dash-size', () => this._updatePanelPosition()),
            this._settings.connect('changed::icon-spacing', () => this._updateIconSpacing()),
            this._settings.connect('changed::panel-padding', () => this._updatePanelPadding()),
            this._settings.connect('changed::transparent-background', () => {
                this._updatePanelBackground();
                // Also update icon styling if using main panel color
                const useMainBgColor = this._settings.get_boolean('icon-use-main-bg-color');
                if (useMainBgColor) {
                    this._updateIconStyling();
                }
            }),
            this._settings.connect('changed::background-opacity', () => {
                this._updatePanelBackground();
                // Also update icon styling if using main panel color
                const useMainBgColor = this._settings.get_boolean('icon-use-main-bg-color');
                if (useMainBgColor) {
                    this._updateIconStyling();
                }
            }),
            this._settings.connect('changed::background-color', () => {
                this._updatePanelBackground();
                // Also update icon styling if using main panel color
                const useMainBgColor = this._settings.get_boolean('icon-use-main-bg-color');
                if (useMainBgColor) {
                    this._updateIconStyling();
                }
            }),
            this._settings.connect('changed::date-position', () => this._updateDatePosition()),
            this._settings.connect('changed::date-spacing', () => this._updateDateSpacing()),
            this._settings.connect('changed::time-font-size', () => this._updateDateFontSize()),
            this._settings.connect('changed::time-font-bold', () => this._updateDateFontSize()),
            this._settings.connect('changed::date-font-size', () => this._updateDateFontSize()),
            this._settings.connect('changed::date-font-bold', () => this._updateDateFontSize()),
            this._settings.connect('changed::time-visible', () => this._updateDateFormat()),
            this._settings.connect('changed::date-visible', () => this._updateDateFormat()),
            this._settings.connect('changed::date-show-year', () => this._updateDateFormat()),
            this._settings.connect('changed::system-icon-size', () => this._updateSystemIconStyling()),
            this._settings.connect('changed::system-icon-margins', () => this._updateSystemIconStyling()),
            this._settings.connect('changed::show-desktop-button-width', () => this._createShowDesktopButton()),
            this._settings.connect('changed::show-desktop-button-margin', () => this._createShowDesktopButton()),
            this._settings.connect('changed::show-apps-separator', () => this._updateShowAppsSeparator()),
            this._settings.connect('changed::separator-width', () => this._updateShowAppsSeparator()),
            this._settings.connect('changed::icon-corner-radius', () => this._updateIconStyling()),
            this._settings.connect('changed::icon-use-main-bg-color', () => this._updateIconStyling()),
            this._settings.connect('changed::icon-background-color', () => this._updateIconStyling()),
            // Icon size is now auto-calculated based on panel size
            this._settings.connect('changed::icon-normal-show-border', () => this._updateIconStyling()),
            this._settings.connect('changed::icon-normal-border-color', () => this._updateIconStyling()),
            this._settings.connect('changed::icon-hover-show-border', () => this._updateIconStyling()),
            this._settings.connect('changed::icon-hover-border-color', () => this._updateIconStyling()),
            this._settings.connect('changed::icon-selected-show-border', () => this._updateIconStyling()),
            this._settings.connect('changed::icon-selected-border-color', () => this._updateIconStyling()),
            this._settings.connect('changed::auto-hide', () => this._updateAutoHide()),
        ];

        // Setup auto-hide if enabled
        this._updateAutoHide();

        // Apply styles with delays to ensure panel is ready
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._updateSystemIconStyling();
            return GLib.SOURCE_REMOVE;
        });

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._updateSystemIconStyling();
            this._updateDatePosition();
            this._updateIconStyling();
            return GLib.SOURCE_REMOVE;
        });

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._updateIconStyling();
            return GLib.SOURCE_REMOVE;
        });

        log('Obision Extension Dash enabled');
    }

    disable() {
        log('Obision Extension Dash disabling');

        // Cancel startup listener if still waiting
        if (this._startupCompleteId) {
            Main.layoutManager.disconnect(this._startupCompleteId);
            this._startupCompleteId = null;
        }

        // Disable auto-hide and clean up
        this._disableAutoHide();
        this._autoHideEnabled = false;

        // Disconnect clock format handler
        if (this._clockNotifyId && this._dateMenu && this._dateMenu._clock) {
            this._dateMenu._clock.disconnect(this._clockNotifyId);
            this._clockNotifyId = null;
        }

        // Clean up custom clock container
        if (this._customClockContainer) {
            this._customClockContainer.destroy();
            this._customClockContainer = null;
            this._customTimeLabel = null;
            this._customDateLabel = null;
        }

        // Show original clock label
        if (this._clockLabel) {
            this._clockLabel.show();
            this._clockLabel = null;
        }

        // Disconnect signals
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        if (this._focusWindowId) {
            global.display.disconnect(this._focusWindowId);
            this._focusWindowId = null;
        }

        if (this._settingsChangedIds) {
            this._settingsChangedIds.forEach(id => this._settings.disconnect(id));
            this._settingsChangedIds = null;
        }

        // Disconnect favorites and app state signals
        if (this._favoritesChangedId) {
            AppFavorites.getAppFavorites().disconnect(this._favoritesChangedId);
            this._favoritesChangedId = null;
        }

        if (this._appStateChangedId && this._appSystem) {
            this._appSystem.disconnect(this._appStateChangedId);
            this._appStateChangedId = null;
        }

        // Disconnect focus window signal
        if (this._focusWindowId) {
            global.display.disconnect(this._focusWindowId);
            this._focusWindowId = null;
        }

        // Disconnect focus app signal
        if (this._focusAppId && this._windowTracker) {
            this._windowTracker.disconnect(this._focusAppId);
            this._focusAppId = null;
        }

        // Disconnect overview signals
        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = null;
        }

        if (this._overviewHidingId) {
            Main.overview.disconnect(this._overviewHidingId);
            this._overviewHidingId = null;
        }

        // Destroy our app icons
        if (this._appIconsBox) {
            this._appIconsBox.destroy_all_children();
        }
        this._appIcons = [];

        // Disconnect menu signals
        if (this._panelButtonPressId && this._panel) {
            this._panel.disconnect(this._panelButtonPressId);
            this._panelButtonPressId = null;
        }

        if (this._stageButtonPressId) {
            global.stage.disconnect(this._stageButtonPressId);
            this._stageButtonPressId = null;
        }

        // Destroy context menu
        if (this._menu) {
            this._menu.destroy();
            this._menu = null;
        }

        // Remove separators
        if (this._showAppsSeparator) {
            this._showAppsSeparator.destroy();
            this._showAppsSeparator = null;
        }

        if (this._runningSeparator) {
            this._runningSeparator.destroy();
            this._runningSeparator = null;
        }

        // Remove icon style provider
        if (this._iconStyleProvider) {
            try {
                const context = St.ThemeContext.get_for_stage(global.stage);
                context.get_theme().unload_stylesheet(this._iconStyleProvider);
            } catch (e) {
                log(`Error unloading icon style provider: ${e.message}`);
            }
            this._iconStyleProvider = null;
        }

        // Show the original dash again
        if (this._dash) {
            this._dash.show();
        }

        // Restore top panel
        if (this._topPanel && this._topBarContainer) {
            this._topBarContainer.remove_child(this._topPanel);
        }

        // Restore top panel expansion
        if (this._topPanel) {
            this._topPanel.x_expand = true;
        }

        // Restore the Activities button
        if (this._topPanel && this._topPanel.statusArea.activities) {
            this._topPanel.statusArea.activities.container.show();
        }

        // Restore the left box
        if (this._topPanel && this._topPanel._leftBox) {
            if (this._originalLeftBoxWidth !== null) {
                this._topPanel._leftBox.set_width(this._originalLeftBoxWidth);
            }
            this._topPanel._leftBox.show();
        }

        // Restore centerBox and rightBox to the panel
        if (this._topPanel && this._topPanel._centerBox && this._originalCenterBoxParent) {
            this._topBarContainer.remove_child(this._topPanel._centerBox);
            this._originalCenterBoxParent.add_child(this._topPanel._centerBox);
        }

        if (this._topPanel && this._topPanel._rightBox && this._originalRightBoxParent) {
            this._topBarContainer.remove_child(this._topPanel._rightBox);
            // Restore original style
            if (this._originalRightBoxStyle !== null) {
                this._topPanel._rightBox.set_style(this._originalRightBoxStyle);
            }
            this._originalRightBoxParent.add_child(this._topPanel._rightBox);
        }

        // Restore date menu to original position
        this._restoreDateMenu();

        if (this._topPanel && this._originalTopPanelParent) {
            this._originalTopPanelParent.add_child(this._topPanel);
        }

        // Show the original panel container
        if (Main.layoutManager.panelBox) {
            Main.layoutManager.panelBox.show();
        }

        // Clean up containers
        if (this._topBarContainer) {
            this._topBarContainer.destroy();
            this._topBarContainer = null;
        }

        if (this._showAppsContainer) {
            this._showAppsContainer.destroy();
            this._showAppsContainer = null;
        }

        if (this._showDesktopContainer) {
            this._showDesktopContainer.destroy();
            this._showDesktopContainer = null;
        }

        if (this._showDesktopButton) {
            this._showDesktopButton = null;
        }

        if (this._scrollContainer) {
            this._scrollContainer.destroy();
            this._scrollContainer = null;
        }

        if (this._scrollView) {
            this._scrollView = null;
        }

        if (this._scrollPrevButton) {
            this._scrollPrevButton = null;
        }

        if (this._scrollNextButton) {
            this._scrollNextButton = null;
        }

        if (this._appIconsBox) {
            this._appIconsBox.destroy();
            this._appIconsBox = null;
        }

        if (this._panel) {
            Main.layoutManager.removeChrome(this._panel);
            this._panel.destroy();
            this._panel = null;
        }

        this._dash = null;
        this._topPanel = null;
        this._originalTopPanelParent = null;
        this._settings = null;
        this._appSystem = null;
        this._appIconsBox = null;

        log('Obision Extension Dash disabled');
    }

    _buildAppIcons() {
        log('_buildAppIcons called');

        if (!this._appIconsBox) {
            log('ERROR: appIconsBox not available');
            return;
        }

        // Clear existing icons
        this._appIconsBox.destroy_all_children();
        this._appIcons = [];

        const padding = this._settings.get_int('panel-padding');
        const dashSize = this._settings.get_int('dash-size');
        const iconSpacing = this._settings.get_int('icon-spacing');
        const containerSize = dashSize - (padding * 2);
        // Auto-calculate icon size: container minus padding for the icon button
        const iconPadding = 8; // 4px padding on each side of icon
        const iconSize = Math.floor(containerSize - iconPadding);

        // Detect if panel is vertical (LEFT or RIGHT position)
        const position = this._settings.get_string('dash-position');
        const isVertical = (position === 'LEFT' || position === 'RIGHT');

        // Set padding on the show apps container and scroll container
        // Show apps container gets full padding, scroll container gets padding except on the side adjacent to show apps
        this._showAppsContainer.set_style(`padding: ${padding}px;`);
        if (isVertical) {
            // Vertical: show apps is at top, so scroll container has no padding-top
            this._scrollContainer.set_style(`padding: ${padding}px; padding-top: 0px;`);
        } else {
            // Horizontal: show apps is at left, so scroll container has no padding-left
            this._scrollContainer.set_style(`padding: ${padding}px; padding-left: 0px;`);
        }
        this._appIconsBox.set_style('padding: 0px;');

        // Create Show Apps button in its own container (outside scroll)
        this._createShowAppsButton(containerSize, iconSize, isVertical);

        // Create separator after show apps button (inside scroll)
        this._createSeparator(containerSize, isVertical, 'apps');

        // Get favorites
        const favorites = AppFavorites.getAppFavorites().getFavorites();
        log(`Found ${favorites.length} favorites`);

        // Get running apps that are NOT favorites
        const runningApps = this._appSystem.get_running();
        const runningNonFavorites = runningApps.filter(app =>
            !favorites.some(fav => fav.get_id() === app.get_id())
        );

        log(`Running non-favorites: ${runningNonFavorites.length}`);

        // Create icons for favorites first
        for (let i = 0; i < favorites.length; i++) {
            const app = favorites[i];
            const isFirstIcon = (i === 0);
            const iconContainer = this._createAppIcon(app, containerSize, iconSize, isFirstIcon, isVertical);
            if (iconContainer) {
                this._appIconsBox.add_child(iconContainer);
                this._appIcons.push(iconContainer);
            }
        }

        // Add separator between favorites and running non-favorites (if there are any)
        if (runningNonFavorites.length > 0) {
            this._createSeparator(containerSize, isVertical, 'running');
        }

        // Create icons for running non-favorites
        for (let i = 0; i < runningNonFavorites.length; i++) {
            const app = runningNonFavorites[i];
            const isFirstIcon = (i === 0); // First after separator, no extra margin
            const iconContainer = this._createAppIcon(app, containerSize, iconSize, isFirstIcon, isVertical);
            if (iconContainer) {
                this._appIconsBox.add_child(iconContainer);
                this._appIcons.push(iconContainer);
            }
        }

        log(`Created ${this._appIcons.length} app icons`);

        // Update focused app indicator
        this._updateFocusedApp();

        // Update scroll buttons visibility after delays to let layout settle
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            this._updateScrollButtonsVisibility();
            return GLib.SOURCE_REMOVE;
        });

        // Check again after a longer delay for layout completion
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._updateScrollButtonsVisibility();
            return GLib.SOURCE_REMOVE;
        });
    }

    _createShowAppsButton(containerSize, iconSize, isVertical = false) {
        const button = new St.Button({
            style_class: 'show-apps-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: containerSize,
            height: containerSize,
        });

        // Store vertical state for styling
        button._isVertical = isVertical;

        const icon = new St.Icon({
            icon_name: 'view-app-grid-symbolic',
            icon_size: iconSize,
        });

        button.set_child(icon);

        button.connect('clicked', () => {
            // Toggle: if overview is showing, hide it; otherwise show apps
            if (Main.overview.visible) {
                Main.overview.hide();
            } else {
                Main.overview.showApps();
            }
        });

        // Right-click context menu for show apps button
        button.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 3) {
                this._showShowAppsContextMenu(button, event);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Apply styling (false = not app icon, false = not first icon, isVertical)
        this._applyIconContainerStyle(button, containerSize, false, false, isVertical);

        // Clear and add to show apps container (outside scroll)
        this._showAppsContainer.destroy_all_children();
        this._showAppsContainer.add_child(button);
        this._showAppsButton = button;
    }

    _createShowDesktopButton() {
        if (!this._showDesktopContainer) {
            log('ERROR: _showDesktopContainer is null!');
            return;
        }

        const dashSize = this._settings.get_int('dash-size');
        const buttonWidth = this._settings.get_int('show-desktop-button-width');
        const position = this._settings.get_string('dash-position');
        const isVertical = (position === 'LEFT' || position === 'RIGHT');

        log(`Creating show desktop button: dashSize=${dashSize}, buttonWidth=${buttonWidth}, isVertical=${isVertical}`);

        // Button fills the full height/width of the panel depending on orientation
        const button = new St.Button({
            style_class: 'show-desktop-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        // Set explicit size
        if (isVertical) {
            button.set_size(dashSize, buttonWidth);
        } else {
            button.set_size(buttonWidth, dashSize);
        }

        button._isVertical = isVertical;

        // Get margin setting
        const margin = this._settings.get_int('show-desktop-button-margin');
        const marginStyle = isVertical ? `margin-top: ${margin}px;` : `margin-left: ${margin}px;`;

        // Transparent by default, opaque on hover
        button.set_style(`background-color: transparent; border-radius: 0; ${marginStyle}`);

        button.connect('notify::hover', () => {
            if (button.hover) {
                button.set_style(`background-color: rgba(255,255,255,0.3); border-radius: 0; ${marginStyle}`);
            } else {
                button.set_style(`background-color: transparent; border-radius: 0; ${marginStyle}`);
            }
        });

        button.connect('clicked', () => {
            // Toggle show desktop - same behavior as Super+D (no animations)
            const workspace = global.workspace_manager.get_active_workspace();
            const windows = workspace.list_windows().filter(w =>
                !w.is_skip_taskbar() &&
                w.get_window_type() === Meta.WindowType.NORMAL
            );

            const allMinimized = windows.every(w => w.minimized);

            // Temporarily disable animations
            const settings = new imports.gi.Gio.Settings({ schema: 'org.gnome.desktop.interface' });
            const animationsEnabled = settings.get_boolean('enable-animations');

            if (animationsEnabled) {
                settings.set_boolean('enable-animations', false);
            }

            if (allMinimized) {
                // Restore windows
                windows.forEach(w => w.unminimize());
                // Activate the last window to restore focus
                if (windows.length > 0) {
                    const lastWindow = windows[windows.length - 1];
                    lastWindow.activate(global.get_current_time());
                }
            } else {
                // Minimize all windows
                windows.filter(w => !w.minimized && w.can_minimize())
                    .forEach(w => w.minimize());
            }

            // Re-enable animations and update focused app after a short delay
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                if (animationsEnabled) {
                    settings.set_boolean('enable-animations', true);
                }
                // Update icon focus states
                this._updateFocusedApp();
                return GLib.SOURCE_REMOVE;
            });
        });

        // No padding on container - button fills full height/width
        this._showDesktopContainer.set_style('padding: 0;');
        this._showDesktopContainer.vertical = isVertical;

        // Clear and add to container
        this._showDesktopContainer.destroy_all_children();
        this._showDesktopContainer.add_child(button);
        this._showDesktopButton = button;
    }

    _updateShowAppsButtonState(active) {
        if (!this._showAppsButton) return;

        const button = this._showAppsButton;

        if (active) {
            // Mark as active/focused - use same style as focused app icons
            button._isActivitiesActive = true;

            // Apply focused/active style (blue highlight like focused apps)
            const cornerRadius = button._cornerRadius || this._settings.get_int('icon-corner-radius');
            const marginStyle = button._marginStyle || '';
            const selectedShowBorder = this._settings.get_boolean('icon-selected-show-border');
            const selectedBorderColor = this._settings.get_string('icon-selected-border-color');
            const selectedBorderStyle = selectedShowBorder ? `border: 2px solid ${selectedBorderColor};` : '';

            button.set_style(`
                background-color: rgba(53, 132, 228, 0.3);
                border-radius: ${cornerRadius}px;
                padding: 4px;
                ${marginStyle}
                ${selectedBorderStyle}
            `);
        } else {
            // Mark as inactive
            button._isActivitiesActive = false;

            // Restore normal style
            const cornerRadius = button._cornerRadius || this._settings.get_int('icon-corner-radius');
            const bgColor = button._originalBgColor || 'transparent';
            const marginStyle = button._marginStyle || '';
            const borderStyle = button._normalBorderStyle || '';

            button.set_style(`
                background-color: ${bgColor};
                border-radius: ${cornerRadius}px;
                padding: 4px;
                ${marginStyle}
                ${borderStyle}
            `);
        }
    }

    _createSeparator(containerSize, isVertical = false, type = 'apps') {
        const showSeparator = this._settings.get_boolean('show-apps-separator');
        if (!showSeparator) return;

        const separatorThickness = this._settings.get_int('separator-width');

        // Separator with small fixed margins (not affected by icon-spacing)
        const separatorMargin = 4;

        let separatorStyle;
        let separatorWidth;
        let separatorHeight;

        if (isVertical) {
            // Vertical panel: separator is horizontal (wide, thin)
            separatorWidth = containerSize;
            separatorHeight = separatorThickness;
            separatorStyle = `background-color: rgba(128, 128, 128, 0.5); width: ${separatorWidth}px; height: ${separatorHeight}px; margin-top: ${separatorMargin}px; margin-bottom: ${separatorMargin}px;`;
        } else {
            // Horizontal panel: separator is vertical (thin, tall)
            separatorWidth = separatorThickness;
            separatorHeight = containerSize;
            separatorStyle = `background-color: rgba(128, 128, 128, 0.5); width: ${separatorWidth}px; height: ${separatorHeight}px; margin-left: ${separatorMargin}px; margin-right: ${separatorMargin}px;`;
        }

        const separator = new St.Widget({
            style: separatorStyle,
            width: separatorWidth,
            height: separatorHeight,
        });
        separator._isSeparator = true;
        separator._isVertical = isVertical;
        separator._separatorType = type;

        this._appIconsBox.add_child(separator);

        // Store reference based on type
        if (type === 'apps') {
            this._showAppsSeparator = separator;
        } else if (type === 'running') {
            this._runningSeparator = separator;
        }
    }

    _createAppIcon(app, containerSize, iconSize, isFirstIcon = false, isVertical = false) {
        const container = new St.Button({
            style_class: 'app-icon-container',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: containerSize,
            height: containerSize,
        });

        // Store if first icon (no spacing) and vertical state
        container._isFirstIcon = isFirstIcon;
        container._isVertical = isVertical;

        // Indicator height + spacing
        const indicatorHeight = 3;
        const indicatorSpacing = 1;
        const indicatorTotal = indicatorHeight + indicatorSpacing;

        // Create vertical box - add top margin equal to indicator space minus 3px to shift up more
        const contentBox = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: `spacing: ${indicatorSpacing}px; margin-top: ${indicatorTotal - 3}px;`,
        });

        const icon = app.create_icon_texture(iconSize - 4);
        if (!icon) {
            log(`Could not create icon for ${app.get_id()}`);
            return null;
        }

        contentBox.add_child(icon);

        // Add running indicator dot
        const isRunning = app.get_state() === Shell.AppState.RUNNING;
        const indicator = new St.Widget({
            style: `background-color: ${isRunning ? 'white' : 'transparent'}; border-radius: 1px;`,
            width: 5,
            height: indicatorHeight,
            x_align: Clutter.ActorAlign.CENTER,
        });
        contentBox.add_child(indicator);
        container._runningIndicator = indicator;

        container.set_child(contentBox);
        container._app = app;

        // Click handler (left click)
        container.connect('clicked', () => {
            const windows = app.get_windows();
            if (windows.length > 0) {
                // Activate first window
                const win = windows[0];
                win.activate(global.get_current_time());
            } else {
                // Launch app
                app.activate();
            }
        });

        // Right-click context menu
        container.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 3) { // Right click
                this._showAppContextMenu(container, app, event);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Enable drag for favorites reordering
        const isFavorite = AppFavorites.getAppFavorites().getFavorites().some(f => f.get_id() === app.get_id());
        if (isFavorite) {
            container._draggable = true;
            this._setupDragAndDrop(container, app);
        }

        // Apply styling (true = is app icon, gets spacing unless first icon)
        this._applyIconContainerStyle(container, containerSize, true, isFirstIcon, isVertical);

        // Store app reference and running state
        container._isRunning = isRunning;

        return container;
    }

    _setupDragAndDrop(container, app) {
        let dragStartX = 0;
        let dragStartY = 0;
        let isDragging = false;
        let dragThreshold = 10;

        container.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                [dragStartX, dragStartY] = event.get_coords();
                isDragging = false;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        container.connect('motion-event', (actor, event) => {
            if (dragStartX === 0 && dragStartY === 0) return Clutter.EVENT_PROPAGATE;

            const [x, y] = event.get_coords();
            const dx = Math.abs(x - dragStartX);
            const dy = Math.abs(y - dragStartY);

            if (dx > dragThreshold || dy > dragThreshold) {
                isDragging = true;
                // Find drop target
                const targetContainer = this._findDropTarget(x, y, container);
                if (targetContainer && targetContainer !== container && targetContainer._app) {
                    this._highlightDropTarget(targetContainer);
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });

        container.connect('button-release-event', (actor, event) => {
            if (isDragging && event.get_button() === 1) {
                const [x, y] = event.get_coords();
                const targetContainer = this._findDropTarget(x, y, container);

                if (targetContainer && targetContainer !== container && targetContainer._app) {
                    // Reorder favorites
                    const favorites = AppFavorites.getAppFavorites();
                    const sourceId = app.get_id();
                    const targetId = targetContainer._app.get_id();

                    const favList = favorites.getFavorites().map(f => f.get_id());
                    const sourceIdx = favList.indexOf(sourceId);
                    const targetIdx = favList.indexOf(targetId);

                    if (sourceIdx !== -1 && targetIdx !== -1) {
                        favorites.moveFavoriteToPos(sourceId, targetIdx);
                        log(`Moved ${sourceId} to position ${targetIdx}`);
                    }
                }
                this._clearDropHighlight();
            }
            dragStartX = 0;
            dragStartY = 0;
            isDragging = false;
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _findDropTarget(x, y, excludeContainer) {
        for (const iconContainer of this._appIcons) {
            if (iconContainer === excludeContainer) continue;
            if (!iconContainer._app) continue;

            const [success, ax, ay] = iconContainer.transform_stage_point(x, y);
            if (success && ax >= 0 && ay >= 0 && ax <= iconContainer.width && ay <= iconContainer.height) {
                return iconContainer;
            }
        }
        return null;
    }

    _openMenuWithOverlay(menu, menuName, sourceActor) {
        // Create a menu manager for this specific source actor
        // This is how GNOME Shell menus work - the manager handles closing
        const menuManager = new PopupMenu.PopupMenuManager(sourceActor);
        menuManager.addMenu(menu);

        // Open the menu
        menu.open();

        // Cleanup when menu closes
        menu.connect('open-state-changed', (m, isOpen) => {
            if (!isOpen) {
                // Destroy menu after a small delay
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    // Clean up anchor if it exists (used for dash menu)
                    if (menu._anchor) {
                        try {
                            Main.uiGroup.remove_child(menu._anchor);
                            menu._anchor.destroy();
                        } catch (e) {
                            // Ignore
                        }
                        menu._anchor = null;
                    }

                    try {
                        menu.destroy();
                    } catch (e) {
                        // Ignore
                    }

                    // Clear reference
                    if (this[`_${menuName}Menu`] === menu) {
                        this[`_${menuName}Menu`] = null;
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
    }

    _showAppContextMenu(container, app, event) {
        // Close any existing menus (manager handles this, but be explicit)
        if (this._appContextMenu) {
            this._appContextMenu.close();
        }
        if (this._showAppsContextMenu) {
            this._showAppsContextMenu.close();
        }
        if (this._dashContextMenu) {
            this._dashContextMenu.close();
        }

        // Create popup menu
        this._appContextMenu = new PopupMenu.PopupMenu(container, 0.5, St.Side.BOTTOM);
        Main.uiGroup.add_child(this._appContextMenu.actor);
        this._appContextMenu.actor.add_style_class_name('app-menu');

        const appInfo = app.get_app_info();
        const isFavorite = AppFavorites.getAppFavorites().isFavorite(app.get_id());
        const isRunning = app.get_state() === Shell.AppState.RUNNING;

        // New Window
        if (appInfo && appInfo.supports_uris()) {
            const newWindowItem = this._appContextMenu.addAction('New Window', () => {
                app.open_new_window(-1);
            });
        }

        // Separator
        this._appContextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Add/Remove from favorites
        if (isFavorite) {
            this._appContextMenu.addAction('Remove from Favorites', () => {
                AppFavorites.getAppFavorites().removeFavorite(app.get_id());
            });
        } else {
            this._appContextMenu.addAction('Add to Favorites', () => {
                AppFavorites.getAppFavorites().addFavorite(app.get_id());
            });
        }

        // Show Details (open in Software Center)
        if (appInfo) {
            this._appContextMenu.addAction('Show Details', () => {
                const id = app.get_id();
                const args = GLib.Variant.new('(ss)', [id, '']);
                Gio.DBus.get(Gio.BusType.SESSION, null, (source, result) => {
                    try {
                        const connection = Gio.DBus.get_finish(result);
                        connection.call(
                            'org.gnome.Software',
                            '/org/gnome/Software',
                            'org.gtk.Actions',
                            'Activate',
                            new GLib.Variant('(sava{sv})', ['details', [args], null]),
                            null,
                            Gio.DBusCallFlags.NONE,
                            -1,
                            null,
                            null
                        );
                    } catch (e) {
                        log(`Error opening app details: ${e.message}`);
                    }
                });
            });
        }

        // Separator before quit
        if (isRunning) {
            this._appContextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Quit
            this._appContextMenu.addAction('Quit', () => {
                app.request_quit();
            });
        }

        // Store menu reference for helper
        this._appContextMenuMenu = this._appContextMenu;

        // Use overlay helper to close on any click outside
        this._openMenuWithOverlay(this._appContextMenu, 'appContext', container);
    }

    _showShowAppsContextMenu(button, event) {
        // Close any existing menus
        if (this._appContextMenu) {
            this._appContextMenu.close();
        }
        if (this._showAppsContextMenu) {
            this._showAppsContextMenu.close();
        }
        if (this._dashContextMenu) {
            this._dashContextMenu.close();
        }

        // Create popup menu
        this._showAppsContextMenu = new PopupMenu.PopupMenu(button, 0.5, St.Side.BOTTOM);
        Main.uiGroup.add_child(this._showAppsContextMenu.actor);
        this._showAppsContextMenu.actor.add_style_class_name('app-menu');

        // Overview options
        this._showAppsContextMenu.addAction('Show All Applications', () => {
            Main.overview.showApps();
        });

        this._showAppsContextMenu.addAction('Show Activities', () => {
            Main.overview.show();
        });

        this._showAppsContextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Terminal
        this._showAppsContextMenu.addAction('Open Terminal', () => {
            const terminals = [
                'org.gnome.Terminal.desktop',
                'org.gnome.Console.desktop',
                'gnome-terminal.desktop',
                'konsole.desktop',
                'xfce4-terminal.desktop',
                'terminator.desktop'
            ];
            const appSystem = Shell.AppSystem.get_default();
            for (const termId of terminals) {
                const term = appSystem.lookup_app(termId);
                if (term) {
                    term.activate();
                    return;
                }
            }
        });

        // File Manager
        this._showAppsContextMenu.addAction('Open Files', () => {
            const fileManagers = [
                'org.gnome.Nautilus.desktop',
                'nautilus.desktop',
                'org.gnome.Files.desktop',
                'dolphin.desktop',
                'thunar.desktop',
                'nemo.desktop'
            ];
            const appSystem = Shell.AppSystem.get_default();
            for (const fmId of fileManagers) {
                const fm = appSystem.lookup_app(fmId);
                if (fm) {
                    fm.activate();
                    return;
                }
            }
        });

        this._showAppsContextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // System options
        this._showAppsContextMenu.addAction('Settings', () => {
            const settingsApps = [
                'org.gnome.Settings.desktop',
                'gnome-control-center.desktop',
                'org.gnome.ControlCenter.desktop'
            ];
            const appSystem = Shell.AppSystem.get_default();
            for (const settingsId of settingsApps) {
                const settings = appSystem.lookup_app(settingsId);
                if (settings) {
                    settings.activate();
                    return;
                }
            }
        });

        this._showAppsContextMenu.addAction('System Monitor', () => {
            const monitorApps = [
                'org.gnome.SystemMonitor.desktop',
                'gnome-system-monitor.desktop'
            ];
            const appSystem = Shell.AppSystem.get_default();
            for (const monitorId of monitorApps) {
                const monitor = appSystem.lookup_app(monitorId);
                if (monitor) {
                    monitor.activate();
                    return;
                }
            }
        });

        this._showAppsContextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Run dialog
        this._showAppsContextMenu.addAction('Run Command...', () => {
            Main.openRunDialog();
        });

        this._showAppsContextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Dash Preferences
        this._showAppsContextMenu.addAction('Dash Preferences...', () => {
            this._openOrFocusPreferences();
        });

        // Store menu reference for helper
        this._showAppsContextMenuMenu = this._showAppsContextMenu;

        // Use overlay helper to close on any click outside
        this._openMenuWithOverlay(this._showAppsContextMenu, 'showAppsContext', button);
    }

    _showDashContextMenu(actor, event) {
        // Close any existing menus
        if (this._appContextMenu) {
            this._appContextMenu.close();
        }
        if (this._showAppsContextMenu) {
            this._showAppsContextMenu.close();
        }
        if (this._dashContextMenu) {
            this._dashContextMenu.close();
        }

        // Get mouse position
        const [mouseX, mouseY] = event.get_coords();

        // Create a temporary anchor actor at mouse position
        const anchor = new St.Widget({
            x: mouseX,
            y: mouseY,
            width: 1,
            height: 1,
        });
        Main.uiGroup.add_child(anchor);

        // Create popup menu at mouse position, opening upwards (TOP side)
        this._dashContextMenu = new PopupMenu.PopupMenu(anchor, 0.0, St.Side.TOP);
        Main.uiGroup.add_child(this._dashContextMenu.actor);
        this._dashContextMenu.actor.add_style_class_name('app-menu');

        // Store anchor for cleanup
        this._dashContextMenu._anchor = anchor;

        // Dash options
        this._dashContextMenu.addAction('Dash Preferences...', () => {
            this._openOrFocusPreferences();
        });

        this._dashContextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Session options submenu
        const sessionSubMenu = new PopupMenu.PopupSubMenuMenuItem('Session');
        this._dashContextMenu.addMenuItem(sessionSubMenu);

        sessionSubMenu.menu.addAction('Lock Screen', () => {
            Main.screenShield.lock(true);
        });

        sessionSubMenu.menu.addAction('Log Out...', () => {
            SystemActions.getDefault().activateLogout();
        });

        sessionSubMenu.menu.addAction('Suspend', () => {
            SystemActions.getDefault().activateSuspend();
        });

        sessionSubMenu.menu.addAction('Restart...', () => {
            SystemActions.getDefault().activateRestart();
        });

        sessionSubMenu.menu.addAction('Power Off...', () => {
            SystemActions.getDefault().activatePowerOff();
        });

        // Store menu reference for helper
        this._dashContextMenuMenu = this._dashContextMenu;

        // Use overlay helper to close on any click outside
        this._openMenuWithOverlay(this._dashContextMenu, 'dashContext', anchor);
    }

    _showDateTimeContextMenu(actor, event) {
        // Close any existing menu
        if (this._dateTimeContextMenu) {
            this._dateTimeContextMenu.close();
            this._dateTimeContextMenu.destroy();
            this._dateTimeContextMenu = null;
        }

        // Create popup menu
        this._dateTimeContextMenu = new PopupMenu.PopupMenu(actor, 0.5, St.Side.BOTTOM);
        Main.uiGroup.add_child(this._dateTimeContextMenu.actor);
        this._dateTimeContextMenu.actor.add_style_class_name('app-menu');

        // Date/Time options
        this._dateTimeContextMenu.addAction('Ajustes de fecha y hora', () => {
            const settings = Shell.AppSystem.get_default().lookup_app('gnome-control-center.desktop');
            if (settings) {
                settings.launch_action('datetime', global.get_current_time());
            }
        });

        this._dateTimeContextMenu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._dateTimeContextMenu.addAction('Abrir Relojes', () => {
            const clocks = Shell.AppSystem.get_default().lookup_app('org.gnome.clocks.desktop');
            if (clocks) {
                clocks.activate();
            } else {
                // Try alternative app ID
                const altClocks = Shell.AppSystem.get_default().lookup_app('gnome-clocks.desktop');
                if (altClocks) {
                    altClocks.activate();
                }
            }
        });

        // Open the menu
        this._dateTimeContextMenu.open();

        // Close menu when clicking outside
        this._dateTimeContextMenu.connect('open-state-changed', (menu, isOpen) => {
            if (!isOpen) {
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    if (this._dateTimeContextMenu) {
                        this._dateTimeContextMenu.destroy();
                        this._dateTimeContextMenu = null;
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
    }

    _setupDateMenuContextMenu() {
        // Disabled for now - GNOME's dateMenu handling is complex
        // Right-click will show the default calendar/notifications panel
        return;
    }

    _closeAllContextMenus() {
        if (this._appContextMenu) {
            this._appContextMenu.close();
        }
        if (this._showAppsContextMenu) {
            this._showAppsContextMenu.close();
        }
        if (this._dashContextMenu) {
            this._dashContextMenu.close();
        }
    }

    _updateFocusedApp() {
        // Use WindowTracker.focus_app which is more reliable
        const tracker = Shell.WindowTracker.get_default();
        const focusedApp = tracker.focus_app;

        for (const container of this._appIcons) {
            if (!container._app) continue;

            const isFocused = focusedApp && container._app.get_id() === focusedApp.get_id();
            const isRunning = container._app.get_state() === Shell.AppState.RUNNING;

            if (isFocused && !container._isFocused) {
                // App just got focus - apply focused style
                container._isFocused = true;

                // Change running indicator to blue and wider
                if (container._runningIndicator) {
                    container._runningIndicator.set_style('background-color: #3584e4; border-radius: 2px;');
                    container._runningIndicator.set_width(14);
                }

                // Apply focused background style - use a visible blue tint
                const selectedShowBorder = this._settings.get_boolean('icon-selected-show-border');
                const selectedBorderColor = this._settings.get_string('icon-selected-border-color');
                const selectedBorderStyle = selectedShowBorder ? `border: 2px solid ${selectedBorderColor};` : '';

                // Use a semi-transparent blue overlay for visibility
                container.set_style(`
                    background-color: rgba(53, 132, 228, 0.3);
                    border-radius: ${container._cornerRadius}px;
                    padding: 4px;
                    ${container._marginStyle || ''}
                    ${selectedBorderStyle}
                `);

            } else if (!isFocused && container._isFocused) {
                // App lost focus - revert to normal style
                container._isFocused = false;

                // Revert running indicator
                if (container._runningIndicator) {
                    container._runningIndicator.set_style(`background-color: ${isRunning ? 'white' : 'transparent'}; border-radius: 1px;`);
                    container._runningIndicator.set_width(5);
                }

                // Revert to normal background style
                const normalShowBorder = this._settings.get_boolean('icon-normal-show-border');
                const normalBorderColor = this._settings.get_string('icon-normal-border-color');
                const normalBorderStyle = normalShowBorder ? `border: 2px solid ${normalBorderColor};` : '';

                container.set_style(`
                    background-color: ${container._originalBgColor};
                    border-radius: ${container._cornerRadius}px;
                    padding: 4px;
                    ${container._marginStyle || ''}
                    ${normalBorderStyle}
                `);
            }
        }
    }

    _highlightDropTarget(container) {
        this._clearDropHighlight();
        container._isDropTarget = true;
        const currentStyle = container.get_style() || '';
        container._preDropStyle = currentStyle;
        container.set_style(currentStyle + ' box-shadow: 0 0 8px rgba(255,255,255,0.8);');
    }

    _clearDropHighlight() {
        for (const iconContainer of this._appIcons) {
            if (iconContainer._isDropTarget) {
                iconContainer.set_style(iconContainer._preDropStyle || '');
                iconContainer._isDropTarget = false;
            }
        }
    }

    _applyIconContainerStyle(container, containerSize, isAppIcon = false, isFirstIcon = false, isVertical = false) {
        const cornerRadius = this._settings.get_int('icon-corner-radius');
        const useMainBgColor = this._settings.get_boolean('icon-use-main-bg-color');
        const iconBgColor = this._settings.get_string('icon-background-color');
        const isTransparent = this._settings.get_boolean('transparent-background');
        const normalShowBorder = this._settings.get_boolean('icon-normal-show-border');
        const normalBorderColor = this._settings.get_string('icon-normal-border-color');

        // Determine background color
        let bgColor;
        let hoverBgColor;
        if (useMainBgColor) {
            // When using main bg color, icons should be transparent to show the panel background
            // This way they have exactly the same transparency as the panel
            bgColor = 'transparent';
            // For hover, use a visible semi-transparent white overlay
            hoverBgColor = 'rgba(255, 255, 255, 0.2)';
        } else {
            bgColor = iconBgColor;
            // Create a more visible hover color - lighten for dark backgrounds
            hoverBgColor = this._lightenColor(bgColor, 1.5);
        }

        const borderStyle = normalShowBorder ? `border: 2px solid ${normalBorderColor};` : '';

        // Apply spacing only to app icons that are NOT the first one after separator
        // Use margin-top for vertical layout, margin-left for horizontal
        const iconSpacing = (isAppIcon && !isFirstIcon) ? this._settings.get_int('icon-spacing') : 0;
        const marginStyle = iconSpacing > 0
            ? (isVertical ? `margin-top: ${iconSpacing}px;` : `margin-left: ${iconSpacing}px;`)
            : '';

        const baseStyle = `
            background-color: ${bgColor};
            border-radius: ${cornerRadius}px;
            padding: 4px;
            ${marginStyle}
            ${borderStyle}
        `;

        container.set_style(baseStyle);

        // Store for hover effects
        container._originalBgColor = bgColor;
        container._cornerRadius = cornerRadius;
        container._normalBorderStyle = borderStyle;
        container._marginStyle = marginStyle;
        container._isVertical = isVertical;
        container._hoverProgress = 0;
        container._animationId = null;

        const hoverShowBorder = this._settings.get_boolean('icon-hover-show-border');
        const hoverBorderColor = this._settings.get_string('icon-hover-border-color');
        const hoverBorderStyle = hoverShowBorder ? `border: 2px solid ${hoverBorderColor};` : '';

        container._hoverBgColor = hoverBgColor;
        container._hoverBorderStyle = hoverBorderStyle;

        // Only connect hover events once
        if (!container._hoverConnected) {
            container._hoverConnected = true;

            container.connect('enter-event', () => {
                container._isHovered = true;
                this._animateHover(container, true);
            });

            container.connect('leave-event', () => {
                container._isHovered = false;
                this._animateHover(container, false);
            });
        }
    }

    _animateHover(container, entering) {
        // Cancel any existing animation
        if (container._animationId) {
            GLib.source_remove(container._animationId);
            container._animationId = null;
        }

        // If container is focused or activities is active (for show apps button), don't animate
        if (container._isFocused || container._isActivitiesActive) {
            return;
        }

        const duration = 150; // ms
        const steps = 10;
        const stepTime = duration / steps;

        const animate = () => {
            // Check again in case focus or activities changed during animation
            if (container._isFocused || container._isActivitiesActive) {
                container._animationId = null;
                return GLib.SOURCE_REMOVE;
            }

            if (entering) {
                container._hoverProgress = Math.min(1, container._hoverProgress + (1 / steps));
            } else {
                container._hoverProgress = Math.max(0, container._hoverProgress - (1 / steps));
            }

            // Interpolate color
            const currentColor = this._interpolateColor(
                container._originalBgColor,
                container._hoverBgColor,
                container._hoverProgress
            );

            // Use hover border when progress > 0.5, otherwise normal
            const currentBorder = container._hoverProgress > 0.5
                ? container._hoverBorderStyle
                : container._normalBorderStyle;

            container.set_style(`
                background-color: ${currentColor};
                border-radius: ${container._cornerRadius}px;
                padding: 4px;
                ${container._marginStyle || ''}
                ${currentBorder}
            `);

            // Continue animation if not complete
            if ((entering && container._hoverProgress < 1) || (!entering && container._hoverProgress > 0)) {
                return GLib.SOURCE_CONTINUE;
            }

            container._animationId = null;
            return GLib.SOURCE_REMOVE;
        };

        container._animationId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, stepTime, animate);
    }

    _interpolateColor(color1Str, color2Str, progress) {
        const parseRgba = (colorStr) => {
            // Handle 'transparent' keyword
            if (colorStr === 'transparent') {
                return { r: 0, g: 0, b: 0, a: 0 };
            }
            const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match) {
                return {
                    r: parseInt(match[1]),
                    g: parseInt(match[2]),
                    b: parseInt(match[3]),
                    a: match[4] ? parseFloat(match[4]) : 1
                };
            }
            return { r: 128, g: 128, b: 128, a: 1 };
        };

        const c1 = parseRgba(color1Str);
        const c2 = parseRgba(color2Str);

        const r = Math.floor(c1.r + (c2.r - c1.r) * progress);
        const g = Math.floor(c1.g + (c2.g - c1.g) * progress);
        const b = Math.floor(c1.b + (c2.b - c1.b) * progress);
        const a = c1.a + (c2.a - c1.a) * progress;

        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    _darkenColor(colorStr, factor) {
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            const r = Math.floor(parseInt(match[1]) * factor);
            const g = Math.floor(parseInt(match[2]) * factor);
            const b = Math.floor(parseInt(match[3]) * factor);
            const a = match[4] ? parseFloat(match[4]) : 1;
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        return colorStr;
    }

    _lightenColor(colorStr, factor) {
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            let r = parseInt(match[1]);
            let g = parseInt(match[2]);
            let b = parseInt(match[3]);
            let a = match[4] ? parseFloat(match[4]) : 1;

            // Lighten the color - add to each channel
            r = Math.min(255, Math.floor(r + (255 - r) * 0.3));
            g = Math.min(255, Math.floor(g + (255 - g) * 0.3));
            b = Math.min(255, Math.floor(b + (255 - b) * 0.3));

            // Also increase alpha if it's low (make it more visible)
            if (a < 0.5) {
                a = Math.min(1, a + 0.3);
            }

            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        return colorStr;
    }

    _updatePanelPosition() {
        if (!this._panel) return;

        const monitor = Main.layoutManager.primaryMonitor;
        const position = this._settings.get_string('dash-position');
        const dashSize = this._settings.get_int('dash-size');

        // Get top panel height (it's now inside our container)
        const topPanelHeight = this._topPanel ? this._topPanel.height : 0;

        switch (position) {
            case 'TOP':
                this._panel.set_position(
                    monitor.x,
                    monitor.y
                );
                // Total height includes top panel + dash
                this._panel.set_size(monitor.width, topPanelHeight + dashSize);
                this._panel.vertical = false;
                this._showAppsContainer.vertical = false;
                this._scrollContainer.vertical = false;
                this._scrollContainer.x_align = Clutter.ActorAlign.START;
                this._scrollContainer.y_align = Clutter.ActorAlign.CENTER;
                this._appIconsBox.vertical = false;
                this._appIconsBox.x_align = Clutter.ActorAlign.START;
                this._appIconsBox.y_align = Clutter.ActorAlign.CENTER;
                this._topBarContainer.vertical = false;
                // Update scroll button icons for horizontal
                this._scrollPrevIcon.icon_name = 'pan-start-symbolic';
                this._scrollNextIcon.icon_name = 'pan-end-symbolic';
                this._scrollView.set_policy(St.PolicyType.EXTERNAL, St.PolicyType.NEVER);
                break;

            case 'BOTTOM':
                this._panel.set_position(
                    monitor.x,
                    monitor.y + monitor.height - (topPanelHeight + dashSize)
                );
                // Total height includes top panel + dash
                this._panel.set_size(monitor.width, topPanelHeight + dashSize);
                this._panel.vertical = false;
                this._showAppsContainer.vertical = false;
                this._showDesktopContainer.vertical = false;
                this._scrollContainer.vertical = false;
                this._scrollContainer.x_align = Clutter.ActorAlign.START;
                this._scrollContainer.y_align = Clutter.ActorAlign.CENTER;
                this._appIconsBox.vertical = false;
                this._appIconsBox.x_align = Clutter.ActorAlign.START;
                this._appIconsBox.y_align = Clutter.ActorAlign.CENTER;
                this._topBarContainer.vertical = false;
                // Update scroll button icons for horizontal
                this._scrollPrevIcon.icon_name = 'pan-start-symbolic';
                this._scrollNextIcon.icon_name = 'pan-end-symbolic';
                this._scrollView.set_policy(St.PolicyType.EXTERNAL, St.PolicyType.NEVER);
                break;

            case 'LEFT':
                this._panel.set_position(
                    monitor.x,
                    monitor.y
                );
                this._panel.set_size(dashSize, monitor.height);
                this._panel.vertical = true;
                this._showAppsContainer.vertical = true;
                this._showDesktopContainer.vertical = true;
                this._scrollContainer.vertical = true;
                this._scrollContainer.x_align = Clutter.ActorAlign.CENTER;
                this._scrollContainer.y_align = Clutter.ActorAlign.START;
                this._appIconsBox.vertical = true;
                this._appIconsBox.x_align = Clutter.ActorAlign.CENTER;
                this._appIconsBox.y_align = Clutter.ActorAlign.START;
                this._topBarContainer.vertical = true;
                // Update scroll button icons for vertical
                this._scrollPrevIcon.icon_name = 'pan-up-symbolic';
                this._scrollNextIcon.icon_name = 'pan-down-symbolic';
                this._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.EXTERNAL);
                break;

            case 'RIGHT':
                this._panel.set_position(
                    monitor.x + monitor.width - dashSize,
                    monitor.y
                );
                this._panel.set_size(dashSize, monitor.height);
                this._panel.vertical = true;
                this._showAppsContainer.vertical = true;
                this._showDesktopContainer.vertical = true;
                this._scrollContainer.vertical = true;
                this._scrollContainer.x_align = Clutter.ActorAlign.CENTER;
                this._scrollContainer.y_align = Clutter.ActorAlign.START;
                this._appIconsBox.vertical = true;
                this._appIconsBox.x_align = Clutter.ActorAlign.CENTER;
                this._appIconsBox.y_align = Clutter.ActorAlign.START;
                this._topBarContainer.vertical = true;
                // Update scroll button icons for vertical
                this._scrollPrevIcon.icon_name = 'pan-up-symbolic';
                this._scrollNextIcon.icon_name = 'pan-down-symbolic';
                this._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.EXTERNAL);
                break;
        }

        // Rebuild icons with new size
        this._buildAppIcons();
    }

    _scrollIcons(direction) {
        if (!this._scrollView) return;

        const position = this._settings.get_string('dash-position');
        const isVertical = (position === 'LEFT' || position === 'RIGHT');

        // Get the adjustment from the scroll view
        const adjustment = isVertical
            ? this._scrollView.get_vadjustment()
            : this._scrollView.get_hadjustment();

        if (!adjustment) {
            log('_scrollIcons: No adjustment available');
            return;
        }

        // Calculate scroll amount based on icon size
        const dashSize = this._settings.get_int('dash-size');
        const padding = this._settings.get_int('panel-padding');
        const iconSpacing = this._settings.get_int('icon-spacing');
        const containerSize = dashSize - (padding * 2);
        // Scroll by one icon + spacing
        const scrollAmount = containerSize + iconSpacing;

        const maxScroll = Math.max(0, adjustment.upper - adjustment.page_size);

        // If there's nothing to scroll, hide both buttons and return
        if (maxScroll <= 0) {
            this._scrollPrevButton.visible = false;
            this._scrollNextButton.visible = false;
            return;
        }

        const newValue = adjustment.value + (direction * scrollAmount);

        // Clamp to valid range
        const clampedValue = Math.max(0, Math.min(newValue, maxScroll));

        log(`_scrollIcons: direction=${direction}, value=${adjustment.value}, maxScroll=${maxScroll}, clampedValue=${clampedValue}`);

        // Use tolerance of 10px for detecting start/end
        const tolerance = 10;

        // Update button visibility BEFORE scrolling
        // When scrolling down/right (direction > 0), show prev button
        // When scrolling up/left (direction < 0), show next button
        if (direction > 0) {
            // Scrolling down/right - prev button should be visible after scroll
            this._scrollPrevButton.visible = true;
            // Hide next button if we'll reach the end
            if (clampedValue >= maxScroll - tolerance) {
                this._scrollNextButton.visible = false;
            }
        } else {
            // Scrolling up/left - next button should be visible after scroll
            this._scrollNextButton.visible = true;
            // Hide prev button if we'll reach the start
            if (clampedValue < tolerance) {
                this._scrollPrevButton.visible = false;
            }
        }

        // Animate the scroll
        adjustment.ease(clampedValue, {
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._updateScrollButtonsVisibility();
            },
        });
    }

    _updateScrollButtonsVisibility() {
        if (!this._scrollView || !this._scrollPrevButton || !this._scrollNextButton) return;

        const position = this._settings.get_string('dash-position');
        const isVertical = (position === 'LEFT' || position === 'RIGHT');

        // Get the adjustment from the scroll view
        const adjustment = isVertical
            ? this._scrollView.get_vadjustment()
            : this._scrollView.get_hadjustment();

        if (!adjustment) {
            log('No adjustment available');
            return;
        }

        // Calculate if there's overflow
        const maxScroll = Math.max(0, adjustment.upper - adjustment.page_size);
        // Need enough overflow to actually need scrolling (at least half an icon worth)
        const dashSize = this._settings.get_int('dash-size');
        const padding = this._settings.get_int('panel-padding');
        const containerSize = dashSize - (padding * 2);
        const minOverflowForScroll = containerSize / 2; // Need at least half an icon hidden to show scroll

        const hasOverflow = maxScroll > minOverflowForScroll;
        // Use a tolerance of 10px for detecting start/end positions
        const tolerance = 10;
        const atStart = adjustment.value < tolerance;
        const atEnd = adjustment.value >= (maxScroll - tolerance) || maxScroll <= minOverflowForScroll;

        log(`Scroll: value=${adjustment.value}, maxScroll=${maxScroll}, hasOverflow=${hasOverflow}, atStart=${atStart}, atEnd=${atEnd}`);

        // Update button styling - icon size (12px) + 4px padding on each side = 20px
        const scrollIconSize = 12;
        const scrollButtonPadding = 4;
        const buttonSize = scrollIconSize + (scrollButtonPadding * 2);

        const buttonStyle = `
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            min-width: ${buttonSize}px;
            min-height: ${buttonSize}px;
            max-width: ${buttonSize}px;
            max-height: ${buttonSize}px;
            padding: ${scrollButtonPadding}px;
        `;

        const buttonHoverStyle = `
            background-color: rgba(255, 255, 255, 0.25);
            border-radius: 4px;
            min-width: ${buttonSize}px;
            min-height: ${buttonSize}px;
            max-width: ${buttonSize}px;
            max-height: ${buttonSize}px;
            padding: ${scrollButtonPadding}px;
        `;

        // Show/hide buttons based on scroll position
        if (hasOverflow) {
            this._scrollPrevButton.visible = !atStart;
            this._scrollPrevButton.set_style(buttonStyle);
            this._scrollPrevButton._normalStyle = buttonStyle;
            this._scrollPrevButton._hoverStyle = buttonHoverStyle;

            this._scrollNextButton.visible = !atEnd;
            this._scrollNextButton.set_style(buttonStyle);
            this._scrollNextButton._normalStyle = buttonStyle;
            this._scrollNextButton._hoverStyle = buttonHoverStyle;
        } else {
            this._scrollPrevButton.visible = false;
            this._scrollNextButton.visible = false;
        }

        // Update icon sizes
        this._scrollPrevIcon.icon_size = scrollIconSize;
        this._scrollNextIcon.icon_size = scrollIconSize;
    }

    _updateIconSpacing() {
        // Just rebuild icons when spacing changes
        this._buildAppIcons();
    }

    _updatePanelPadding() {
        if (!this._appIconsBox) return;

        const padding = this._settings.get_int('panel-padding');
        const iconSpacing = this._settings.get_int('icon-spacing');
        this._appIconsBox.set_style(`padding: ${padding}px;`);
        if (this._appIconsBox.layout_manager) {
            this._appIconsBox.layout_manager.spacing = iconSpacing;
        }

        // Update dash size when padding changes
        this._updatePanelPosition();
    }

    _togglePanel() {
        if (this._panel) {
            this._panel.visible = !this._panel.visible;
        }
    }

    _updateAutoHide() {
        const autoHide = this._settings.get_boolean('auto-hide');

        log(`_updateAutoHide: autoHide=${autoHide}, _autoHideEnabled=${this._autoHideEnabled}`);

        if (autoHide && !this._autoHideEnabled) {
            // Enable auto-hide
            this._autoHideEnabled = true;
            this._setupAutoHide();
        } else if (!autoHide && this._autoHideEnabled) {
            // Disable auto-hide
            this._autoHideEnabled = false;
            this._disableAutoHide();
        }
    }

    _setupAutoHide() {
        if (!this._panel) return;

        log('_setupAutoHide: Setting up auto-hide');

        // Store original panel position for restoration
        this._panelOriginalX = this._panel.x;
        this._panelOriginalY = this._panel.y;

        // Connect to panel enter/leave events
        this._panelEnterId = this._panel.connect('enter-event', () => {
            log('Panel enter-event');
            this._onPanelEnter();
        });

        this._panelLeaveId = this._panel.connect('leave-event', () => {
            log('Panel leave-event');
            this._onPanelLeave();
        });

        // Create hover zone at panel edge to trigger show
        this._createHoverZone();

        // Initially hide the panel after a short delay
        this._autoHideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._autoHideTimeoutId = null;
            this._hidePanel();
            return GLib.SOURCE_REMOVE;
        });
    }

    _disableAutoHide() {
        log('_disableAutoHide: Disabling auto-hide');

        // Disconnect panel events
        if (this._panelEnterId && this._panel) {
            this._panel.disconnect(this._panelEnterId);
            this._panelEnterId = null;
        }

        if (this._panelLeaveId && this._panel) {
            this._panel.disconnect(this._panelLeaveId);
            this._panelLeaveId = null;
        }

        // Remove hover zone
        if (this._hoverZone) {
            Main.layoutManager.removeChrome(this._hoverZone);
            this._hoverZone.destroy();
            this._hoverZone = null;
        }

        // Cancel any pending timeout
        if (this._autoHideTimeoutId) {
            GLib.source_remove(this._autoHideTimeoutId);
            this._autoHideTimeoutId = null;
        }

        // Show the panel immediately
        this._showPanelImmediate();
    }

    _createHoverZone() {
        if (this._hoverZone) {
            Main.layoutManager.removeChrome(this._hoverZone);
            this._hoverZone.destroy();
        }

        const monitor = Main.layoutManager.primaryMonitor;
        const position = this._settings.get_string('dash-position');
        const hoverSize = 5; // pixels to trigger show

        let x, y, width, height;

        switch (position) {
            case 'TOP':
                x = monitor.x;
                y = monitor.y;
                width = monitor.width;
                height = hoverSize;
                break;
            case 'BOTTOM':
                x = monitor.x;
                y = monitor.y + monitor.height - hoverSize;
                width = monitor.width;
                height = hoverSize;
                break;
            case 'LEFT':
                x = monitor.x;
                y = monitor.y;
                width = hoverSize;
                height = monitor.height;
                break;
            case 'RIGHT':
                x = monitor.x + monitor.width - hoverSize;
                y = monitor.y;
                width = hoverSize;
                height = monitor.height;
                break;
            default:
                return;
        }

        this._hoverZone = new St.Widget({
            name: 'obision-hover-zone',
            reactive: true,
            track_hover: true,
            x: x,
            y: y,
            width: width,
            height: height,
        });

        this._hoverZone.connect('enter-event', () => {
            log('Hover zone enter-event');
            this._showPanel();
        });

        Main.layoutManager.addChrome(this._hoverZone, {
            affectsStruts: false,
            trackFullscreen: true,
        });

        log(`_createHoverZone: Created at x=${x}, y=${y}, width=${width}, height=${height}`);
    }

    _onPanelEnter() {
        // Cancel any hide timeout
        if (this._autoHideTimeoutId) {
            GLib.source_remove(this._autoHideTimeoutId);
            this._autoHideTimeoutId = null;
        }
    }

    _onPanelLeave() {
        if (!this._autoHideEnabled) return;

        // Cancel any existing timeout
        if (this._autoHideTimeoutId) {
            GLib.source_remove(this._autoHideTimeoutId);
            this._autoHideTimeoutId = null;
        }

        // Hide after delay
        this._autoHideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._autoHideTimeoutId = null;
            this._hidePanel();
            return GLib.SOURCE_REMOVE;
        });
    }

    _showPanel() {
        if (!this._panel) return;
        if (!this._panelHidden) return;

        log('_showPanel: Showing panel');

        this._panelHidden = false;

        const monitor = Main.layoutManager.primaryMonitor;
        const position = this._settings.get_string('dash-position');
        const dashSize = this._settings.get_int('dash-size');

        let targetX, targetY;

        switch (position) {
            case 'TOP':
                targetX = monitor.x;
                targetY = monitor.y;
                break;
            case 'BOTTOM':
                targetX = monitor.x;
                targetY = monitor.y + monitor.height - this._panel.height;
                break;
            case 'LEFT':
                targetX = monitor.x;
                targetY = monitor.y;
                break;
            case 'RIGHT':
                targetX = monitor.x + monitor.width - dashSize;
                targetY = monitor.y;
                break;
            default:
                return;
        }

        // Animate panel in
        this._panel.ease({
            x: targetX,
            y: targetY,
            opacity: 255,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _showPanelImmediate() {
        if (!this._panel) return;

        this._panelHidden = false;
        this._panel.opacity = 255;

        // Restore position
        this._updatePanelPosition();
    }

    _hidePanel() {
        if (!this._panel) return;
        if (this._panelHidden) return;

        // Don't hide if a menu is open
        if (this._menu && this._menu.isOpen) return;
        if (this._appContextMenu && this._appContextMenu.isOpen) return;
        if (this._showAppsContextMenu && this._showAppsContextMenu.isOpen) return;
        if (this._dashContextMenu && this._dashContextMenu.isOpen) return;

        log('_hidePanel: Hiding panel');

        this._panelHidden = true;

        const monitor = Main.layoutManager.primaryMonitor;
        const position = this._settings.get_string('dash-position');

        let targetX = this._panel.x;
        let targetY = this._panel.y;

        // Move panel off-screen based on position
        switch (position) {
            case 'TOP':
                targetY = monitor.y - this._panel.height;
                break;
            case 'BOTTOM':
                targetY = monitor.y + monitor.height;
                break;
            case 'LEFT':
                targetX = monitor.x - this._panel.width;
                break;
            case 'RIGHT':
                targetX = monitor.x + monitor.width;
                break;
        }

        // Animate panel out
        this._panel.ease({
            x: targetX,
            y: targetY,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    _updatePanelBackground() {
        if (!this._panel) return;

        const isTransparent = this._settings.get_boolean('transparent-background');

        if (isTransparent) {
            // Set semi-transparent background using opacity value
            const opacity = this._settings.get_int('background-opacity') / 100;
            this._panel.set_style(`background-color: rgba(0, 0, 0, ${opacity});`);
        } else {
            // Parse and apply solid color
            const colorString = this._settings.get_string('background-color');
            log(`Applying background color: ${colorString}`);

            // The color string is already in CSS format (e.g., "rgba(0,0,0,0.8)")
            this._panel.set_style(`background-color: ${colorString};`);
        }
    }

    _updateSystemIconStyling() {
        if (!this._topPanel || !this._topPanel._rightBox) {
            log('_updateSystemIconStyling: topPanel or rightBox not available');
            return;
        }

        const iconSize = this._settings.get_int('system-icon-size');
        const iconMargins = this._settings.get_int('system-icon-margins');
        const fontSize = Math.max(11, iconSize - 5); // Font size relative to icon size

        log(`_updateSystemIconStyling: iconSize=${iconSize}, iconMargins=${iconMargins}, fontSize=${fontSize}`);

        const applyIconSize = (actor) => {
            const constructorName = actor.constructor ? actor.constructor.name : '';

            if (constructorName === 'St_Icon') {
                // Apply icon size and margins to left and right
                actor.set_style(`icon-size: ${iconSize}px; width: ${iconSize}px; height: ${iconSize}px; min-width: ${iconSize}px; min-height: ${iconSize}px; margin-left: ${iconMargins}px; margin-right: ${iconMargins}px;`);
            } else if (constructorName === 'St_Label') {
                actor.set_style(`font-size: ${fontSize}px;`);
            }

            // Recursively apply to all children
            if (actor.get_children) {
                actor.get_children().forEach(child => applyIconSize(child));
            }
        };

        applyIconSize(this._topPanel._rightBox);

        // Force a relayout
        this._topPanel._rightBox.queue_relayout();
    }

    _openOrFocusPreferences() {
        // Try to find and focus existing preferences window
        const dominated = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        for (const win of dominated) {
            const title = win.get_title();
            // Check if it's our extension's preferences window
            if (title && (title.includes('Obision') || title.includes('obision-extension-dash'))) {
                win.activate(global.get_current_time());
                return;
            }
        }

        // No existing window found, open new preferences
        this.openPreferences();
    }

    _createContextMenu() {
        // Create popup menu with no source actor
        this._menu = new PopupMenu.PopupMenu(null, 0.0, St.Side.TOP);
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();

        // Add menu item for preferences
        const prefsItem = new PopupMenu.PopupMenuItem('Dash configuration...');
        prefsItem.connect('activate', () => {
            this._openOrFocusPreferences();
        });
        this._menu.addMenuItem(prefsItem);

        // Add separator
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Add enable timestamp
        const enableDate = new Date(this._enableTimestamp);
        const enableString = enableDate.toLocaleString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            day: '2-digit',
            month: '2-digit'
        });
        const timestampItem = new PopupMenu.PopupMenuItem(`Habilitado: ${enableString}`);
        this._menu.addMenuItem(timestampItem);

        const option2 = new PopupMenu.PopupMenuItem('Option 2');
        this._menu.addMenuItem(option2);

        const option3 = new PopupMenu.PopupMenuItem('Option 3');
        this._menu.addMenuItem(option3);

        const option4 = new PopupMenu.PopupMenuItem('Option 4');
        this._menu.addMenuItem(option4);

        const option5 = new PopupMenu.PopupMenuItem('Option 5');
        this._menu.addMenuItem(option5);

        // Connect right-click to show menu
        this._panelButtonPressId = this._panel.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 3) { // Right click
                // Get click coordinates
                const [stageX, stageY] = event.get_coords();

                // Close if already open
                if (this._menu.isOpen) {
                    this._menu.close();
                } else {
                    // Get menu size to position it above the cursor
                    this._menu.actor.show();
                    const [menuWidth, menuHeight] = this._menu.actor.get_size();

                    // Position menu above and slightly to the left of cursor
                    const menuX = Math.floor(stageX - 10);
                    const menuY = Math.floor(stageY - menuHeight);

                    this._menu.actor.set_position(menuX, menuY);
                    this._menu.open(true);
                }
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Close menu when clicking outside - use capture phase
        this._stageButtonPressId = global.stage.connect('captured-event', (actor, event) => {
            if (event.type() === Clutter.EventType.BUTTON_PRESS && this._menu.isOpen) {
                const [x, y] = event.get_coords();

                // Check if click is on menu actor
                const menuActor = this._menu.actor;
                if (!menuActor.contains(global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y))) {
                    this._menu.close();
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _updateDatePosition() {
        if (!this._topPanel) return;

        const datePosition = this._settings.get_string('date-position');

        // Get the date menu from the center box
        if (!this._dateMenu) {
            this._dateMenu = this._topPanel.statusArea.dateMenu;
            if (!this._dateMenu) {
                log('Date menu not found');
                return;
            }

            // Save original parent and index
            this._originalDateMenuParent = this._dateMenu.container.get_parent();
            if (this._originalDateMenuParent) {
                this._originalDateMenuIndex = this._originalDateMenuParent.get_children().indexOf(this._dateMenu.container);
            }

            // Save original style
            this._originalDateMenuStyle = this._dateMenu.container.get_style();

            // Add right-click handler to dateMenu
            this._setupDateMenuContextMenu();
        }

        if (datePosition === 'down') {
            // Create a vertical container if it doesn't exist
            if (!this._dateVerticalContainer) {
                this._dateVerticalContainer = new St.BoxLayout({
                    vertical: true,
                    x_align: Clutter.ActorAlign.END,
                    y_align: Clutter.ActorAlign.CENTER,
                    style: 'background-color: transparent;',
                });

                // Save the original right box children
                this._originalRightBoxChildren = [];
                const rightBoxChildren = this._topPanel._rightBox.get_children();
                for (let child of rightBoxChildren) {
                    this._originalRightBoxChildren.push(child);
                }

                // Remove all children from right box
                rightBoxChildren.forEach(child => {
                    this._topPanel._rightBox.remove_child(child);
                });

                // Create a horizontal box for the icons
                this._iconsHorizontalBox = new St.BoxLayout({
                    vertical: false,
                    x_align: Clutter.ActorAlign.END,
                    style: 'background-color: transparent;',
                });

                // Add original children to the horizontal box
                this._originalRightBoxChildren.forEach(child => {
                    this._iconsHorizontalBox.add_child(child);
                });

                // Add horizontal box to vertical container
                this._dateVerticalContainer.add_child(this._iconsHorizontalBox);

                // Add vertical container to right box
                this._topPanel._rightBox.add_child(this._dateVerticalContainer);
            }

            // Move date to vertical container (below icons)
            const currentParent = this._dateMenu.container.get_parent();
            if (currentParent) {
                currentParent.remove_child(this._dateMenu.container);
            }

            // Add date below the icons box
            this._dateVerticalContainer.add_child(this._dateMenu.container);

            // Apply spacing
            this._updateDateSpacing();

            log('Date moved down below icons');
        } else {
            // Restore to left position (in center box, aligned right) only if not already there
            if (this._dateVerticalContainer) {
                this._restoreDateMenu();
            }

            // Apply horizontal spacing
            this._updateDateSpacing();

            log('Date moved to left position (in center box)');
        }

        // Create/update the custom clock format AFTER positioning
        this._updateDateFormat();
    }

    _updateDateSpacing() {
        const spacing = this._settings.get_int('date-spacing');

        if (this._dateVerticalContainer && this._iconsHorizontalBox) {
            // Vertical spacing when in down position
            this._dateVerticalContainer.set_style(`spacing: ${spacing}px; background-color: transparent;`);
            log(`Date vertical spacing updated to ${spacing}px`);
        } else if (this._topPanel && this._topPanel._centerBox) {
            // Horizontal spacing in left position (margin-right on center box)
            this._topPanel._centerBox.set_style(`margin-right: ${spacing}px;`);
            log(`Center box margin-right updated to ${spacing}px`);
        }
    }

    _updateDateFontSize() {
        // Recreate the clock format when font settings change
        if (this._customClockContainer && this._dateMenu) {
            // Disconnect the old handler
            if (this._clockNotifyId && this._dateMenu._clock) {
                this._dateMenu._clock.disconnect(this._clockNotifyId);
                this._clockNotifyId = null;
            }

            // Destroy and recreate the container
            this._customClockContainer.destroy();
            this._customClockContainer = null;
            this._customTimeLabel = null;
            this._customDateLabel = null;

            // Recreate with new settings
            this._updateDateFormat();
        }
    }

    _updateDateFormat() {
        if (!this._dateMenu) {
            this._dateMenu = this._topPanel ? this._topPanel.statusArea.dateMenu : null;
            if (!this._dateMenu) {
                return;
            }
        }

        if (!this._dateMenu._clock) {
            return;
        }

        const timeVisible = this._settings.get_boolean('time-visible');
        const dateVisible = this._settings.get_boolean('date-visible');
        const dateShowYear = this._settings.get_boolean('date-show-year');
        const timeFontSize = this._settings.get_int('time-font-size');
        const timeFontBold = this._settings.get_boolean('time-font-bold');
        const dateFontSize = this._settings.get_int('date-font-size');
        const dateFontBold = this._settings.get_boolean('date-font-bold');

        // Find the original clock label only once
        if (!this._clockLabel) {
            const findClockLabel = (actor) => {
                if (actor.constructor && actor.constructor.name === 'St_Label') {
                    if (actor.text) {
                        return actor;
                    }
                }
                if (actor.get_children) {
                    for (let child of actor.get_children()) {
                        const found = findClockLabel(child);
                        if (found) return found;
                    }
                }
                return null;
            };
            this._clockLabel = findClockLabel(this._dateMenu.container);

            if (!this._clockLabel) {
                return;
            }
        }

        // Create custom container only once
        if (!this._customClockContainer) {
            // Hide original label immediately
            this._clockLabel.hide();

            // Delay container creation to avoid initial layout issues
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                this._createCustomClockContainer(timeVisible, dateVisible, dateShowYear, timeFontSize, timeFontBold, dateFontSize, dateFontBold);
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        // Update existing container
        this._updateClockContent(timeVisible, dateVisible, dateShowYear, timeFontSize, timeFontBold, dateFontSize, dateFontBold);
    }

    _createCustomClockContainer(timeVisible, dateVisible, dateShowYear, timeFontSize, timeFontBold, dateFontSize, dateFontBold) {
        if (this._customClockContainer) {
            return;
        }

        // Create main vertical container
        this._customClockContainer = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'spacing: 0px;',
        });

        // Create time container with centered panel
        const timeContainer = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._customTimeLabel = new St.Label({
            text: '',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._customTimeLabel.clutter_text.line_alignment = Pango.Alignment.CENTER;

        timeContainer.add_child(this._customTimeLabel);

        // Create date container with centered panel
        const dateContainer = new St.BoxLayout({
            vertical: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._customDateLabel = new St.Label({
            text: '',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._customDateLabel.clutter_text.line_alignment = Pango.Alignment.CENTER;

        dateContainer.add_child(this._customDateLabel);

        // Add containers to main container
        this._customClockContainer.add_child(timeContainer);
        this._customClockContainer.add_child(dateContainer);

        // Add main container to the dateMenu container
        this._dateMenu.container.add_child(this._customClockContainer);

        // Now update the content
        this._updateClockContent(timeVisible, dateVisible, dateShowYear, timeFontSize, timeFontBold, dateFontSize, dateFontBold);
    }

    _updateClockContent(timeVisible, dateVisible, dateShowYear, timeFontSize, timeFontBold, dateFontSize, dateFontBold) {
        if (!this._customClockContainer) {
            return;
        }

        // Disconnect previous clock handler if exists
        if (this._clockNotifyId) {
            this._dateMenu._clock.disconnect(this._clockNotifyId);
            this._clockNotifyId = null;
        }

        // Update the clock text
        const updateClockText = () => {
            if (!this._customTimeLabel || !this._customDateLabel) {
                return;
            }

            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = String(now.getFullYear());

            const timeWeight = timeFontBold ? '700' : '400';
            const dateWeight = dateFontBold ? '700' : '400';

            const timeText = `${hours}:${minutes}`;
            const dateText = dateShowYear ? `${day}/${month}/${year}` : `${day}/${month}`;

            // Update time label
            if (timeVisible) {
                const timeMarkup = `<span font_size="${timeFontSize * 1024}" font_weight="${timeWeight}">${timeText}</span>`;
                this._customTimeLabel.clutter_text.set_markup(timeMarkup);
                this._customTimeLabel.show();
            } else {
                this._customTimeLabel.hide();
            }

            // Update date label
            if (dateVisible) {
                const dateMarkup = `<span font_size="${dateFontSize * 1024}" font_weight="${dateWeight}">${dateText}</span>`;
                this._customDateLabel.clutter_text.set_markup(dateMarkup);
                this._customDateLabel.show();
            } else {
                this._customDateLabel.hide();
            }

            // Show/hide container
            if (timeVisible || dateVisible) {
                this._customClockContainer.show();
                this._dateMenu.container.show();
            } else {
                this._customClockContainer.hide();
                this._dateMenu.container.hide();
            }
        };

        // Update immediately
        updateClockText();

        // Connect to clock updates
        this._clockNotifyId = this._dateMenu._clock.connect('notify::clock', updateClockText);
    }

    _restoreDateMenu() {
        if (!this._dateMenu || !this._originalDateMenuParent) return;

        // If we created a vertical container, restore the original right box structure
        if (this._dateVerticalContainer) {
            // Remove date from vertical container
            const currentParent = this._dateMenu.container.get_parent();
            if (currentParent) {
                currentParent.remove_child(this._dateMenu.container);
            }

            // Remove vertical container from right box
            this._topPanel._rightBox.remove_child(this._dateVerticalContainer);

            // Restore original children to right box
            if (this._originalRightBoxChildren) {
                this._originalRightBoxChildren.forEach(child => {
                    // Remove from icons box if still there
                    const parent = child.get_parent();
                    if (parent) {
                        parent.remove_child(child);
                    }
                    this._topPanel._rightBox.add_child(child);
                });
            }

            // Clean up
            this._dateVerticalContainer.destroy();
            this._dateVerticalContainer = null;
            this._iconsHorizontalBox = null;
            this._originalRightBoxChildren = null;
        }

        // Restore date to original position
        const currentParent = this._dateMenu.container.get_parent();
        if (currentParent && currentParent !== this._originalDateMenuParent) {
            currentParent.remove_child(this._dateMenu.container);
        }

        if (this._originalDateMenuIndex >= 0) {
            this._originalDateMenuParent.insert_child_at_index(this._dateMenu.container, this._originalDateMenuIndex);
        } else {
            this._originalDateMenuParent.add_child(this._dateMenu.container);
        }

        // Don't restore original style, we'll apply our spacing
    }

    _moveShowAppsToStart() {
        // No longer needed - we create our own icons in _buildAppIcons
        log('_moveShowAppsToStart: No longer needed with custom icons');
    }

    _updateShowAppsButtonHeight() {
        // No longer needed - we handle this in _buildAppIcons
        log('_updateShowAppsButtonHeight: No longer needed with custom icons');
    }

    _updateShowAppsSeparator() {
        // Just rebuild icons to update separator
        this._buildAppIcons();
    }

    _updateIconStyling() {
        // Just rebuild icons with new styling
        log('_updateIconStyling called');
        this._buildAppIcons();
    }
}
