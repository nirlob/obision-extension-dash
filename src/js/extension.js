import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import St from 'gi://St';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
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
    }

    enable() {
        log('Obision Extension Dash enabling');
        
        this._settings = this.getSettings();
        
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
        });
        
        // Create dash container (will hold the dash icons)
        this._dashContainer = new St.BoxLayout({
            name: 'obision-dash-container',
            style_class: 'obision-dash-container',
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            clip_to_allocation: true,
        });
        
        // Create top-bar container (will hold the top panel)
        this._topBarContainer = new St.BoxLayout({
            name: 'obision-topbar-container',
            style_class: 'obision-topbar-container',
            x_expand: true,
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
        
        // Add top panel to our container
        this._topBarContainer.add_child(this._topPanel);
        
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
        ];
        
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
        
        // Disconnect signals
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
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
        
        // Restore dash to overview
        if (this._dash && this._dashContainer) {
            this._dashContainer.remove_child(this._dash);
        }
        
        // Restore top panel
        if (this._topPanel && this._topBarContainer) {
            this._topBarContainer.remove_child(this._topPanel);
        }
        
        // Restore the Activities button
        if (this._topPanel && this._topPanel.statusArea.activities) {
            this._topPanel.statusArea.activities.container.show();
        }
        
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
    }

    _updateIconSpacing() {
        if (!this._dash || !this._dash._box) return;
        
        const iconSpacing = this._settings.get_int('icon-spacing');
        log(`_updateIconSpacing: ${iconSpacing}px`);
        this._dash._box.set_style(`spacing: ${iconSpacing}px;`);
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
        
        // Add example options
        const option1 = new PopupMenu.PopupMenuItem('Option 1');
        this._menu.addMenuItem(option1);
        
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
}
