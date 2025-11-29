import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
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
        this._dashContainer = null;
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
    }

    enable() {
        log('Obision Extension Dash enabling');
        
        this._settings = this.getSettings();
        this._enableTimestamp = Date.now();
        
        // Get the native dash from overview
        this._dash = Main.overview.dash;
        
        // Save original parent and position
        this._originalDashParent = this._dash.get_parent();
        if (this._originalDashParent) {
            this._originalDashIndex = this._originalDashParent.get_children().indexOf(this._dash);
        }
        
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
        
        // Create dash container (will hold the dash icons)
        this._dashContainer = new St.BoxLayout({
            name: 'obision-dash-container',
            style_class: 'obision-dash-container',
            x_expand: true,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            clip_to_allocation: true,
        });
        
        // Create top-bar container (will hold the top panel)
        this._topBarContainer = new St.BoxLayout({
            name: 'obision-topbar-container',
            style_class: 'obision-topbar-container',
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.END,
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
        
        // Remove dash from overview
        if (this._originalDashParent) {
            this._originalDashParent.remove_child(this._dash);
        }
        
        // Add dash to dash container
        this._dashContainer.add_child(this._dash);
        
        // Prevent dash from centering - keep icons at start
        this._dash._box.x_align = Clutter.ActorAlign.START;
        this._dash._box.y_align = Clutter.ActorAlign.START;
        
        // Add containers to main panel
        this._panel.add_child(this._dashContainer);
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
        
        // Force dash to redisplay and be visible
        if (this._dash._redisplay) {
            this._dash._redisplay();
        }
        
        // Make dash always visible
        this._dash.visible = true;
        this._dash.opacity = 255;
        this._dash.show();
        
        // Connect to dash visibility changes to force it visible
        this._dashNotifyVisibleId = this._dash.connect('notify::visible', () => {
            if (!this._dash.visible) {
                this._dash.visible = true;
                this._dash.show();
            }
        });
        
        this._dashNotifyOpacityId = this._dash.connect('notify::opacity', () => {
            if (this._dash.opacity !== 255) {
                this._dash.opacity = 255;
            }
        });
        
        // Monitor when items are added to ensure they stay visible and have correct height
        if (this._dash._box) {
            this._dashBoxChildAddedId = this._dash._box.connect('child-added', (box, child) => {
                log('Child added to dash box, updating visibility and height');
                this._dash.visible = true;
                this._dash.show();
                
                // Force height on the newly added child
                const padding = this._settings.get_int('panel-padding');
                const containerHeight = this._panel.height - (padding * 2);
                
                child.natural_height = containerHeight;
                child.min_height = containerHeight;
                child.height = containerHeight;
                
                const button = child.first_child;
                if (button) {
                    button.natural_height = containerHeight;
                    button.min_height = containerHeight;
                    button.height = containerHeight;
                }
            });
        }
        
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
            this._settings.connect('changed::icon-size-multiplier', () => this._updateIconStyling()),
            this._settings.connect('changed::icon-show-border', () => this._updateIconStyling()),
            this._settings.connect('changed::icon-border-color', () => this._updateIconStyling()),
        ];
        
        // Monitor window focus changes to update active app indicator
        this._focusWindowId = global.display.connect('notify::focus-window', () => {
            this._updateActiveApp();
        });
        
        // Apply all styles with delays to ensure panel is ready
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._updateSystemIconStyling();
            return GLib.SOURCE_REMOVE;
        });
        
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            this._updateSystemIconStyling();
            return GLib.SOURCE_REMOVE;
        });
        
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._updateSystemIconStyling();
            this._updateDatePosition();
            this._moveShowAppsToStart();
            this._updateShowAppsSeparator();
            this._updateIconStyling();
            return GLib.SOURCE_REMOVE;
        });
        
        // Apply icon styling again after a longer delay to ensure it overrides theme
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
        
        // Disconnect dash visibility signals
        if (this._dashNotifyVisibleId && this._dash) {
            this._dash.disconnect(this._dashNotifyVisibleId);
            this._dashNotifyVisibleId = null;
        }
        
        if (this._dashNotifyOpacityId && this._dash) {
            this._dash.disconnect(this._dashNotifyOpacityId);
            this._dashNotifyOpacityId = null;
        }
        
        if (this._dashBoxChildAddedId && this._dash && this._dash._box) {
            this._dash._box.disconnect(this._dashBoxChildAddedId);
            this._dashBoxChildAddedId = null;
        }
        
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
        
        // Restore dash to overview
        if (this._dash && this._dashContainer) {
            this._dashContainer.remove_child(this._dash);
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
        
        if (this._dashContainer) {
            this._dashContainer.destroy();
            this._dashContainer = null;
        }
        
        if (this._panel) {
            Main.layoutManager.removeChrome(this._panel);
            this._panel.destroy();
            this._panel = null;
        }
        
        // Put dash back in overview
        if (this._dash && this._originalDashParent) {
            if (this._originalDashIndex >= 0) {
                this._originalDashParent.insert_child_at_index(this._dash, this._originalDashIndex);
            } else {
                this._originalDashParent.add_child(this._dash);
            }
        }
        
        this._dash = null;
        this._originalDashParent = null;
        this._originalDashIndex = null;
        this._topPanel = null;
        this._originalTopPanelParent = null;
        this._settings = null;
        
        log('Obision Extension Dash disabled');
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
                this._dashContainer.vertical = false;
                this._topBarContainer.vertical = false;
                if (this._dash._box) this._dash._box.vertical = false;
                this._updateDashSize(monitor.width, dashSize);
                break;
                
            case 'BOTTOM':
                this._panel.set_position(
                    monitor.x,
                    monitor.y + monitor.height - (topPanelHeight + dashSize)
                );
                // Total height includes top panel + dash
                this._panel.set_size(monitor.width, topPanelHeight + dashSize);
                this._panel.vertical = false;
                this._dashContainer.vertical = false;
                this._topBarContainer.vertical = false;
                if (this._dash._box) this._dash._box.vertical = false;
                this._updateDashSize(monitor.width, dashSize);
                break;
                
            case 'LEFT':
                this._panel.set_position(
                    monitor.x,
                    monitor.y
                );
                this._panel.set_size(dashSize, monitor.height);
                this._panel.vertical = true;
                this._dashContainer.vertical = true;
                this._topBarContainer.vertical = true;
                if (this._dash._box) this._dash._box.vertical = true;
                this._updateDashSize(dashSize, monitor.height - topPanelHeight);
                break;
                
            case 'RIGHT':
                this._panel.set_position(
                    monitor.x + monitor.width - dashSize,
                    monitor.y
                );
                this._panel.set_size(dashSize, monitor.height);
                this._panel.vertical = true;
                this._dashContainer.vertical = true;
                this._topBarContainer.vertical = true;
                if (this._dash._box) this._dash._box.vertical = true;
                this._updateDashSize(dashSize, monitor.height - topPanelHeight);
                break;
        }
    }

    _updateDashSize(width, height) {
        if (!this._dash) return;
        
        const padding = this._settings.get_int('panel-padding');
        const iconSpacing = this._settings.get_int('icon-spacing');
        
        // Icon size should fill the available height/width minus padding
        const availableSize = Math.min(width, height) - (padding * 2);
        const containerHeight = height - (padding * 2);
        
        log(`_updateDashSize: width=${width}, height=${height}, padding=${padding}, iconSpacing=${iconSpacing}, containerHeight=${containerHeight}`);
        
        // Set icon size
        this._dash.iconSize = availableSize;
        
        // Apply spacing between icons and force height
        if (this._dash._box) {
            const numChildren = this._dash._box.get_n_children();
            log(`Dash box has ${numChildren} children`);
            
            // Set spacing on the box
            this._dash._box.set_style(`spacing: ${iconSpacing}px; height: ${containerHeight}px;`);
            
            // Force height on all children
            for (let i = 0; i < numChildren; i++) {
                const child = this._dash._box.get_child_at_index(i);
                if (!child) continue;
                
                log(`Setting height on child ${i}: ${containerHeight}px, child class: ${child.get_style_class_name()}`);
                
                // Use natural-height-set property
                child.natural_height = containerHeight;
                child.min_height = containerHeight;
                child.height = containerHeight;
                
                // Get the first child (app button)
                const button = child.first_child;
                if (button) {
                    log(`  Button found, setting height: ${containerHeight}px`);
                    button.natural_height = containerHeight;
                    button.min_height = containerHeight;
                    button.height = containerHeight;
                }
            }
        }
        
        // Reapply system icon styling after dash size changes
        this._updateSystemIconStyling();
        
        // Update show apps button height
        this._updateShowAppsButtonHeight();
        
        // Update separator height if it exists
        this._updateShowAppsSeparator();
    }

    _updateIconSpacing() {
        if (!this._dash || !this._dash._box) return;
        
        const iconSpacing = this._settings.get_int('icon-spacing');
        const padding = this._settings.get_int('panel-padding');
        const dashSize = this._settings.get_int('dash-size');
        const containerHeight = dashSize - (padding * 2);
        
        log(`_updateIconSpacing: ${iconSpacing}px, containerHeight: ${containerHeight}px`);
        
        // Set the layout's spacing property directly
        if (this._dash._box.layout_manager) {
            this._dash._box.layout_manager.spacing = iconSpacing;
        }
        
        // Also set via style for compatibility
        this._dash._box.set_style(`spacing: ${iconSpacing}px; height: ${containerHeight}px;`);
        this._dash.queue_relayout();
    }

    _updatePanelPadding() {
        if (!this._dashContainer) return;
        
        const padding = this._settings.get_int('panel-padding');
        this._dashContainer.set_style(`padding: ${padding}px;`);
        
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
        if (!this._dash || !this._dash._showAppsIcon) {
            log('Dash or showAppsIcon not available');
            return;
        }
        
        const showAppsIcon = this._dash._showAppsIcon;
        const dashBox = this._dash._box;
        
        if (!dashBox) {
            log('Dash box not available');
            return;
        }
        
        // Get current parent of showAppsIcon
        const currentParent = showAppsIcon.get_parent();
        if (!currentParent) {
            log('ShowAppsIcon has no parent');
            return;
        }
        
        // Remove from current position
        currentParent.remove_child(showAppsIcon);
        
        // Add at the beginning (index 0)
        dashBox.insert_child_at_index(showAppsIcon, 0);
        
        // Remove any margin from the dash box itself to eliminate left spacing
        if (this._dash._box) {
            // The spacing property of BoxLayout creates gaps between children
            // Set margin-left to negative to compensate for the spacing on first element
            const iconSpacing = this._settings.get_int('icon-spacing');
            this._dash._box.set_style(`spacing: ${iconSpacing}px; margin-left: 0px;`);
        }
        
        // Also remove padding from dashContainer
        if (this._dashContainer) {
            const padding = this._settings.get_int('panel-padding');
            this._dashContainer.set_style(`padding: 0px ${padding}px ${padding}px 0px;`);
        }
        
        // Force 100% height on show apps button and its internal elements
        this._updateShowAppsButtonHeight();
        
        log('Show Applications button moved to start');
        
        // Force a redisplay to update the layout
        if (this._dash._redisplay) {
            this._dash._redisplay();
        }
    }

    _updateShowAppsButtonHeight() {
        if (!this._dash || !this._dash._showAppsIcon) {
            return;
        }
        
        const padding = this._settings.get_int('panel-padding');
        const dashSize = this._settings.get_int('dash-size');
        const containerHeight = dashSize - (padding * 2);
        
        const showAppsIcon = this._dash._showAppsIcon;
        
        // Function to recursively set height on all actors
        const setHeightRecursive = (actor, depth = 0) => {
            if (!actor) return;
            
            actor.natural_height = containerHeight;
            actor.min_height = containerHeight;
            actor.height = containerHeight;
            
            log(`${'  '.repeat(depth)}Setting height on: ${actor.constructor.name}`);
            
            // Also check for clutter actor children
            if (actor.get_first_child) {
                let child = actor.get_first_child();
                while (child) {
                    // Only set height on container elements, not on the icon itself
                    if (child.constructor.name !== 'St_Icon') {
                        setHeightRecursive(child, depth + 1);
                    }
                    child = child.get_next_sibling();
                }
            }
        };
        
        setHeightRecursive(showAppsIcon);
        
        log(`Show Applications button height set to: ${containerHeight}px`);
    }

    _updateShowAppsSeparator() {
        if (!this._dash || !this._dash._box) {
            log('Dash or dash box not available');
            return;
        }
        
        const showSeparator = this._settings.get_boolean('show-apps-separator');
        const dashBox = this._dash._box;
        
        // Remove existing separator if present
        if (this._showAppsSeparator) {
            if (this._showAppsSeparator.get_parent()) {
                this._showAppsSeparator.get_parent().remove_child(this._showAppsSeparator);
            }
            this._showAppsSeparator.destroy();
            this._showAppsSeparator = null;
        }
        
        if (showSeparator) {
            const position = this._settings.get_string('dash-position');
            const separatorWidth = this._settings.get_int('separator-width');
            const padding = this._settings.get_int('panel-padding');
            const dashSize = this._settings.get_int('dash-size');
            const containerHeight = dashSize - (padding * 2);
            
            if (position === 'TOP' || position === 'BOTTOM') {
                // Horizontal panel: vertical separator
                this._showAppsSeparator = new St.Widget({
                    style_class: 'dash-separator',
                    style: `background-color: rgba(0, 0, 0, 0.5); margin-left: 8px; margin-right: 8px;`,
                });
                
                // Set explicit dimensions like dash children
                this._showAppsSeparator.natural_width = separatorWidth;
                this._showAppsSeparator.min_width = separatorWidth;
                this._showAppsSeparator.width = separatorWidth;
                this._showAppsSeparator.natural_height = containerHeight;
                this._showAppsSeparator.min_height = containerHeight;
                this._showAppsSeparator.height = containerHeight;
            } else {
                // Vertical panel: horizontal separator
                this._showAppsSeparator = new St.Widget({
                    style_class: 'dash-separator',
                    style: `background-color: rgba(0, 0, 0, 0.5); margin-top: 8px; margin-bottom: 8px;`,
                });
                
                // Set explicit dimensions like dash children
                this._showAppsSeparator.natural_width = containerHeight;
                this._showAppsSeparator.min_width = containerHeight;
                this._showAppsSeparator.width = containerHeight;
                this._showAppsSeparator.natural_height = separatorWidth;
                this._showAppsSeparator.min_height = separatorWidth;
                this._showAppsSeparator.height = separatorWidth;
            }
            
            // Insert separator after the Show Applications button (at index 1)
            dashBox.insert_child_at_index(this._showAppsSeparator, 1);
            log('Show Applications separator added');
        }
    }

    _updateIconStyling() {
        log('_updateIconStyling called');
        
        if (!this._dash || !this._dash._box) {
            log('Dash or dash box not available for icon styling');
            return;
        }
        
        log('Dash and box available, getting settings');
        
        const cornerRadius = this._settings.get_int('icon-corner-radius');
        const useMainBgColor = this._settings.get_boolean('icon-use-main-bg-color');
        const iconBgColor = this._settings.get_string('icon-background-color');
        const mainBgColor = this._settings.get_string('background-color');
        const showBorder = this._settings.get_boolean('icon-show-border');
        const borderColor = this._settings.get_string('icon-border-color');
        
        // Determine which color to use
        const bgColor = useMainBgColor ? mainBgColor : iconBgColor;
        
        // Get icon size multiplier (1-8, default 7 = 0.7)
        const sizeMultiplier = this._settings.get_int('icon-size-multiplier');
        const multiplier = sizeMultiplier / 10.0;
        
        // Calculate icon size based on multiplier
        const iconSize = Math.floor(this._dash.iconSize * multiplier);
        
        log(`_updateIconStyling: cornerRadius=${cornerRadius}, useMainBgColor=${useMainBgColor}, bgColor=${bgColor}, showBorder=${showBorder}, borderColor=${borderColor}, sizeMultiplier=${sizeMultiplier}, multiplier=${multiplier}, iconSize=${iconSize}`);
        
        // Apply styles directly with inline styles (this is the only way to override theme styles)
        const numChildren = this._dash._box.get_n_children();
        log(`Applying icon styling to ${numChildren} children`);
        
        try {
            for (let i = 0; i < numChildren; i++) {
                const child = this._dash._box.get_child_at_index(i);
                if (!child) {
                    log(`Child ${i} is null, skipping`);
                    continue;
                }
                
                // Apply color, border radius, and border to the container
                const borderStyle = showBorder ? `border: 2px solid ${borderColor};` : '';
                const containerStyle = `background-color: ${bgColor}; border-radius: ${cornerRadius}px; padding: 0px; ${borderStyle}`;
                child.set_style(containerStyle);
                log(`Applied container style to child ${i}`);
                
                // Parse the background color and create a darker version for hover
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
                    return null;
                };
                
                const darkenColor = (colorStr, factor = 0.7) => {
                    const color = parseRgba(colorStr);
                    if (color) {
                        const r = Math.floor(color.r * factor);
                        const g = Math.floor(color.g * factor);
                        const b = Math.floor(color.b * factor);
                        return `rgba(${r}, ${g}, ${b}, ${color.a})`;
                    }
                    return colorStr;
                };
                
                const lightenColor = (colorStr, factor = 1.3) => {
                    const color = parseRgba(colorStr);
                    if (color) {
                        const r = Math.min(255, Math.floor(color.r * factor));
                        const g = Math.min(255, Math.floor(color.g * factor));
                        const b = Math.min(255, Math.floor(color.b * factor));
                        return `rgba(${r}, ${g}, ${b}, ${color.a})`;
                    }
                    return colorStr;
                };
                
                // Store original colors and border settings
                child._originalBgColor = bgColor;
                child._hoverBgColor = darkenColor(bgColor, 0.7);
                child._activeBgColor = lightenColor(bgColor, 1.3);
                child._cornerRadius = cornerRadius;
                child._showBorder = showBorder;
                child._borderColor = borderColor;
                child._borderStyle = borderStyle;
                child._isHovered = false;
                
                log(`Original color: ${bgColor}, Hover color: ${child._hoverBgColor}, Active color: ${child._activeBgColor}`);
                
                // Store reference to update active state later
                child._appButton = child.first_child;
                
                // Make the button and all its children transparent, and set icon size
                const button = child.first_child;
                if (button) {
                    button.set_style('background-color: transparent; padding: 4px;');
                    log(`Applied button style to child ${i}`);
                    
                    // Helper to interpolate between two RGBA colors
                    const interpolateColor = (color1Str, color2Str, progress) => {
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
                            return null;
                        };
                        
                        const c1 = parseRgba(color1Str);
                        const c2 = parseRgba(color2Str);
                        
                        if (c1 && c2) {
                            const r = Math.floor(c1.r + (c2.r - c1.r) * progress);
                            const g = Math.floor(c1.g + (c2.g - c1.g) * progress);
                            const b = Math.floor(c1.b + (c2.b - c1.b) * progress);
                            const a = c1.a + (c2.a - c1.a) * progress;
                            return `rgba(${r}, ${g}, ${b}, ${a})`;
                        }
                        return color1Str;
                    };
                    
                    // Add hover effect to button via enter/leave events with interpolation
                    if (!button._hoverEnterSignalId) {
                        button._hoverEnterSignalId = button.connect('enter-event', (actor) => {
                            const parent = actor.get_parent();
                            if (parent) {
                                parent.remove_all_transitions();
                                parent._isHovered = true;
                                
                                if (parent._animationId) {
                                    GLib.source_remove(parent._animationId);
                                    parent._animationId = null;
                                }
                                
                                // Check if app is focused - if so, don't apply hover
                                if (parent._isFocused) return;
                                
                                let step = 0;
                                const steps = 10;
                                const stepDuration = 20; // 200ms total
                                
                                const animate = () => {
                                    if (!parent._isHovered || step >= steps) {
                                        if (parent._isHovered) {
                                            parent.set_style(`background-color: ${parent._hoverBgColor}; border-radius: ${parent._cornerRadius}px; padding: 0px; ${parent._borderStyle}`);
                                        }
                                        return GLib.SOURCE_REMOVE;
                                    }
                                    
                                    step++;
                                    const progress = step / steps;
                                    const currentColor = interpolateColor(parent._originalBgColor, parent._hoverBgColor, progress);
                                    parent.set_style(`background-color: ${currentColor}; border-radius: ${parent._cornerRadius}px; padding: 0px; ${parent._borderStyle}`);
                                    return GLib.SOURCE_CONTINUE;
                                };
                                
                                parent._animationId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, stepDuration, animate);
                            }
                        });
                    }
                    
                    if (!button._hoverLeaveSignalId) {
                        button._hoverLeaveSignalId = button.connect('leave-event', (actor) => {
                            const parent = actor.get_parent();
                            if (parent) {
                                parent.remove_all_transitions();
                                parent._isHovered = false;
                                
                                if (parent._animationId) {
                                    GLib.source_remove(parent._animationId);
                                    parent._animationId = null;
                                }
                                
                                // Check if app is focused - return to active color instead of original
                                const targetColor = parent._isFocused ? parent._activeBgColor : parent._originalBgColor;
                                
                                let step = 0;
                                const steps = 10;
                                const stepDuration = 20;
                                
                                const animate = () => {
                                    if (parent._isHovered || step >= steps) {
                                        if (!parent._isHovered) {
                                            parent.set_style(`background-color: ${targetColor}; border-radius: ${parent._cornerRadius}px; padding: 0px; ${parent._borderStyle}`);
                                        }
                                        return GLib.SOURCE_REMOVE;
                                    }
                                    
                                    step++;
                                    const progress = 1 - (step / steps);
                                    const currentColor = interpolateColor(targetColor, parent._hoverBgColor, progress);
                                    parent.set_style(`background-color: ${currentColor}; border-radius: ${parent._cornerRadius}px; padding: 0px; ${parent._borderStyle}`);
                                    return GLib.SOURCE_CONTINUE;
                                };
                                
                                parent._animationId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, stepDuration, animate);
                            }
                        });
                    }
                    
                    // Find and resize the actual icon recursively
                    const findAndResizeIcon = (actor, depth = 0) => {
                        if (!actor) return false;
                        
                        const actorName = actor.constructor ? actor.constructor.name : 'Unknown';
                        log(`${'  '.repeat(depth)}Checking actor: ${actorName}`);
                        
                        if (actorName === 'St_Icon') {
                            log(`${'  '.repeat(depth)}Found St_Icon, setting size to ${iconSize}px`);
                            actor.set_icon_size(iconSize);
                            actor.set_size(iconSize, iconSize);
                            return true;
                        }
                        
                        // Check if it has an icon property
                        if (actor.icon && actor.icon.constructor && actor.icon.constructor.name === 'St_Icon') {
                            log(`${'  '.repeat(depth)}Found icon property, setting size to ${iconSize}px`);
                            actor.icon.set_icon_size(iconSize);
                            actor.icon.set_size(iconSize, iconSize);
                            return true;
                        }
                        
                        // Recursively check children
                        if (actor.get_first_child) {
                            let childActor = actor.get_first_child();
                            while (childActor) {
                                if (findAndResizeIcon(childActor, depth + 1)) {
                                    return true;
                                }
                                childActor = childActor.get_next_sibling();
                            }
                        }
                        
                        return false;
                    };
                    
                    findAndResizeIcon(button);
                }
            }
            log('Icon styling applied successfully');
        } catch (e) {
            log(`Error applying icon styling: ${e.message}`);
        }
        
        // Reapply icon spacing after styling to ensure it's not overridden
        this._updateIconSpacing();
        
        // Monitor focused window changes to update active state
        this._updateActiveApp();
    }
    
    _updateActiveApp() {
        if (!this._dash || !this._dash._box) return;
        
        const focusedWindow = global.display.get_focus_window();
        const focusedApp = focusedWindow ? Shell.WindowTracker.get_default().get_window_app(focusedWindow) : null;
        
        log(`Focused app: ${focusedApp ? focusedApp.get_id() : 'none'}`);
        
        // Update all app buttons
        const numChildren = this._dash._box.get_n_children();
        for (let i = 0; i < numChildren; i++) {
            const child = this._dash._box.get_child_at_index(i);
            if (!child || !child._appButton) continue;
            
            const appButton = child._appButton;
            const app = appButton.app;
            
            if (app && focusedApp && app.get_id() === focusedApp.get_id()) {
                // This is the focused app - apply active color
                child.set_style(`background-color: ${child._activeBgColor}; border-radius: ${child._cornerRadius}px; padding: 0px; ${child._borderStyle || ''}`);
                child._isFocused = true;
                log(`Set active style for app: ${app.get_id()}`);
            } else if (child._isFocused && !child._isHovered) {
                // Was focused, no longer - revert to normal
                child.set_style(`background-color: ${child._originalBgColor}; border-radius: ${child._cornerRadius}px; padding: 0px; ${child._borderStyle || ''}`);
                child._isFocused = false;
            }
        }
    }
}
