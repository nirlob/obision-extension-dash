import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import St from 'gi://St';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

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
        this._iconStyleProvider = null;
        this._overviewShowingId = null;
        this._overviewHidingId = null;
        this._dashBoxNotifyVisibleId = null;
        this._dashBoxNotifyOpacityId = null;
        this._visibilityCheckId = null;
        this._startupCompleteId = null;
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
        
        // Create app icons box (expands to fill available space)
        this._appIconsBox = new St.BoxLayout({
            name: 'obision-app-icons',
            style_class: 'obision-dash-container',
            vertical: false,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            clip_to_allocation: true,
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
        
        // Add containers to main panel: icons (expands) + topbar (shrinks to content)
        this._panel.add_child(this._appIconsBox);
        this._panel.add_child(this._topBarContainer);
        
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
        
        // Connect to monitor changes
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._updatePanelPosition();
        });
        
        // Connect to settings changes
        this._settingsChangedIds = [
            this._settings.connect('changed::dash-position', () => this._updatePanelPosition()),
            this._settings.connect('changed::dash-size', () => this._updatePanelPosition()),
            this._settings.connect('changed::icon-spacing', () => this._updateIconSpacing()),
            this._settings.connect('changed::panel-padding', () => this._updatePanelPadding()),
            this._settings.connect('changed::transparent-background', () => this._updatePanelBackground()),
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
        ];
        
        // Monitor window focus changes to update active app indicator
        this._focusWindowId = global.display.connect('notify::focus-window', () => {
            this._updateActiveApp();
        });
        
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
        
        // Add keybinding to toggle
        Main.wm.addKeybinding(
            'toggle-dash',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL,
            () => this._togglePanel()
        );
        
        log('Obision Extension Dash enabled');
    }

    disable() {
        log('Obision Extension Dash disabling');
        
        // Cancel startup listener if still waiting
        if (this._startupCompleteId) {
            Main.layoutManager.disconnect(this._startupCompleteId);
            this._startupCompleteId = null;
        }
        
        // Remove keybinding
        Main.wm.removeKeybinding('toggle-dash');
        
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
        
        // Remove separator
        if (this._showAppsSeparator) {
            this._showAppsSeparator.destroy();
            this._showAppsSeparator = null;
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
        const containerHeight = dashSize - (padding * 2);
        // Auto-calculate icon size: container minus padding for the icon button
        const iconPadding = 8; // 4px padding on each side of icon
        const iconSize = Math.floor(containerHeight - iconPadding);
        
        // Set spacing on the box
        this._appIconsBox.set_style(`spacing: ${iconSpacing}px;`);
        
        // Create Show Apps button first
        this._createShowAppsButton(containerHeight, iconSize);
        
        // Create separator
        this._createSeparator(containerHeight);
        
        // Get favorites
        const favorites = AppFavorites.getAppFavorites().getFavorites();
        log(`Found ${favorites.length} favorites`);
        
        // Get running apps
        const runningApps = this._appSystem.get_running();
        
        // Build combined app list (favorites first, then running non-favorites)
        const appList = [...favorites];
        for (const app of runningApps) {
            if (!favorites.some(fav => fav.get_id() === app.get_id())) {
                appList.push(app);
            }
        }
        
        log(`Total apps to show: ${appList.length}`);
        
        // Create icon for each app
        for (const app of appList) {
            const iconContainer = this._createAppIcon(app, containerHeight, iconSize);
            if (iconContainer) {
                this._appIconsBox.add_child(iconContainer);
                this._appIcons.push(iconContainer);
            }
        }
        
        log(`Created ${this._appIcons.length} app icons`);
    }
    
    _createShowAppsButton(containerHeight, iconSize) {
        const button = new St.Button({
            style_class: 'show-apps-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: containerHeight,
            height: containerHeight,
        });
        
        const icon = new St.Icon({
            icon_name: 'view-app-grid-symbolic',
            icon_size: iconSize,
        });
        
        button.set_child(icon);
        
        button.connect('clicked', () => {
            Main.overview.showApps();
        });
        
        // Apply styling
        this._applyIconContainerStyle(button, containerHeight);
        
        this._appIconsBox.add_child(button);
        this._showAppsButton = button;
    }
    
    _createSeparator(containerHeight) {
        const showSeparator = this._settings.get_boolean('show-apps-separator');
        if (!showSeparator) return;
        
        const separatorWidth = this._settings.get_int('separator-width');
        const iconSpacing = this._settings.get_int('icon-spacing');
        
        // Use negative margin to cancel out the icon-spacing from the box
        const separator = new St.Widget({
            style: `background-color: rgba(128, 128, 128, 0.5); width: ${separatorWidth}px; height: ${containerHeight}px; margin: 0 -${iconSpacing / 2}px;`,
            width: separatorWidth,
            height: containerHeight,
        });
        
        this._appIconsBox.add_child(separator);
        this._showAppsSeparator = separator;
    }
    
    _createAppIcon(app, containerHeight, iconSize) {
        const container = new St.Button({
            style_class: 'app-icon-container',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: containerHeight,
            height: containerHeight,
        });
        
        // Indicator height + spacing
        const indicatorHeight = 3;
        const indicatorSpacing = 1;
        const indicatorTotal = indicatorHeight + indicatorSpacing;
        
        // Create vertical box - add top margin equal to indicator space minus 1px to shift up slightly
        const contentBox = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: `spacing: ${indicatorSpacing}px; margin-top: ${indicatorTotal - 1}px;`,
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
        
        // Click handler
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
        
        // Enable drag for favorites reordering
        const dominated = AppFavorites.getAppFavorites().getFavorites().some(f => f.get_id() === app.get_id());
        if (dominated) {
            container._draggable = true;
            this._setupDragAndDrop(container, app);
        }
        
        // Apply styling
        this._applyIconContainerStyle(container, containerHeight);
        
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
    
    _applyIconContainerStyle(container, containerHeight) {
        const cornerRadius = this._settings.get_int('icon-corner-radius');
        const useMainBgColor = this._settings.get_boolean('icon-use-main-bg-color');
        const iconBgColor = this._settings.get_string('icon-background-color');
        const mainBgColor = this._settings.get_string('background-color');
        const normalShowBorder = this._settings.get_boolean('icon-normal-show-border');
        const normalBorderColor = this._settings.get_string('icon-normal-border-color');
        
        const bgColor = useMainBgColor ? mainBgColor : iconBgColor;
        const borderStyle = normalShowBorder ? `border: 2px solid ${normalBorderColor};` : '';
        
        container.set_style(`
            background-color: ${bgColor};
            border-radius: ${cornerRadius}px;
            padding: 4px;
            ${borderStyle}
        `);
        
        // Store colors for hover effects
        container._originalBgColor = bgColor;
        container._cornerRadius = cornerRadius;
        container._normalBorderStyle = borderStyle;
        container._hoverProgress = 0;
        container._animationId = null;
        
        const hoverBgColor = this._darkenColor(bgColor, 0.7);
        const hoverShowBorder = this._settings.get_boolean('icon-hover-show-border');
        const hoverBorderColor = this._settings.get_string('icon-hover-border-color');
        const hoverBorderStyle = hoverShowBorder ? `border: 2px solid ${hoverBorderColor};` : '';
        
        container._hoverBgColor = hoverBgColor;
        container._hoverBorderStyle = hoverBorderStyle;
        
        // Add smooth fade hover effect
        container.connect('enter-event', () => {
            container._isHovered = true;
            this._animateHover(container, true);
        });
        
        container.connect('leave-event', () => {
            container._isHovered = false;
            this._animateHover(container, false);
        });
    }
    
    _animateHover(container, entering) {
        // Cancel any existing animation
        if (container._animationId) {
            GLib.source_remove(container._animationId);
            container._animationId = null;
        }
        
        const duration = 150; // ms
        const steps = 10;
        const stepTime = duration / steps;
        
        const animate = () => {
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
                this._appIconsBox.vertical = false;
                this._topBarContainer.vertical = false;
                break;
                
            case 'BOTTOM':
                this._panel.set_position(
                    monitor.x,
                    monitor.y + monitor.height - (topPanelHeight + dashSize)
                );
                // Total height includes top panel + dash
                this._panel.set_size(monitor.width, topPanelHeight + dashSize);
                this._panel.vertical = false;
                this._appIconsBox.vertical = false;
                this._topBarContainer.vertical = false;
                break;
                
            case 'LEFT':
                this._panel.set_position(
                    monitor.x,
                    monitor.y
                );
                this._panel.set_size(dashSize, monitor.height);
                this._panel.vertical = true;
                this._appIconsBox.vertical = true;
                this._topBarContainer.vertical = true;
                break;
                
            case 'RIGHT':
                this._panel.set_position(
                    monitor.x + monitor.width - dashSize,
                    monitor.y
                );
                this._panel.set_size(dashSize, monitor.height);
                this._panel.vertical = true;
                this._appIconsBox.vertical = true;
                this._topBarContainer.vertical = true;
                break;
        }
        
        // Rebuild icons with new size
        this._buildAppIcons();
    }

    _updateIconSpacing() {
        // Just rebuild icons when spacing changes
        this._buildAppIcons();
    }

    _updatePanelPadding() {
        if (!this._appIconsBox) return;
        
        const padding = this._settings.get_int('panel-padding');
        this._appIconsBox.set_style(`padding: ${padding}px;`);
        
        // Update dash size when padding changes
        this._updatePanelPosition();
    }

    _togglePanel() {
        if (this._panel) {
            this._panel.visible = !this._panel.visible;
        }
    }

    _updatePanelBackground() {
        if (!this._panel) return;
        
        const isTransparent = this._settings.get_boolean('transparent-background');
        
        if (isTransparent) {
            // Set transparent background
            this._panel.set_style('background-color: transparent;');
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

    _createContextMenu() {
        // Create popup menu with no source actor
        this._menu = new PopupMenu.PopupMenu(null, 0.0, St.Side.TOP);
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();
        
        // Add menu item for preferences
        const prefsItem = new PopupMenu.PopupMenuItem('Dash configuration...');
        prefsItem.connect('activate', () => {
            this.openPreferences();
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
    
    _updateActiveApp() {
        if (!this._appIconsBox || !this._appIcons) return;
        
        const focusedWindow = global.display.get_focus_window();
        const focusedApp = focusedWindow ? Shell.WindowTracker.get_default().get_window_app(focusedWindow) : null;
        
        // Update all our custom app icons
        for (const iconContainer of this._appIcons) {
            if (!iconContainer._app) continue;
            
            const app = iconContainer._app;
            const isFocused = focusedApp && app.get_id() === focusedApp.get_id();
            const isRunning = app.get_state() === Shell.AppState.RUNNING;
            
            // Update running indicator
            if (iconContainer._runningIndicator) {
                iconContainer._runningIndicator.set_style(
                    `background-color: ${isRunning ? 'white' : 'transparent'}; border-radius: 1px;`
                );
            }
            
            if (isFocused && !iconContainer._isFocused) {
                // App just got focus - apply active style
                const selectedShowBorder = this._settings.get_boolean('icon-selected-show-border');
                const selectedBorderColor = this._settings.get_string('icon-selected-border-color');
                const selectedBorderStyle = selectedShowBorder ? `border: 2px solid ${selectedBorderColor};` : '';
                const activeBgColor = this._darkenColor(iconContainer._originalBgColor, 1.3);
                
                iconContainer.set_style(`
                    background-color: ${activeBgColor};
                    border-radius: ${iconContainer._cornerRadius}px;
                    padding: 4px;
                    ${selectedBorderStyle}
                `);
                iconContainer._isFocused = true;
            } else if (!isFocused && iconContainer._isFocused) {
                // App lost focus - revert to normal style
                const normalShowBorder = this._settings.get_boolean('icon-normal-show-border');
                const normalBorderColor = this._settings.get_string('icon-normal-border-color');
                const normalBorderStyle = normalShowBorder ? `border: 2px solid ${normalBorderColor};` : '';
                
                iconContainer.set_style(`
                    background-color: ${iconContainer._originalBgColor};
                    border-radius: ${iconContainer._cornerRadius}px;
                    padding: 4px;
                    ${normalBorderStyle}
                `);
                iconContainer._isFocused = false;
            }
        }
    }
}
