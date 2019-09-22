import morphdom from 'morphdom';
import EventEmitter from 'events';
import { Tip } from 'util/ui/tip';
import { KeyHandler } from 'comp/browser/key-handler';
import { Logger } from 'util/logger';

const OnlyDirectEvents = {
    mouseenter: true,
    mouseleave: true
};

class View extends EventEmitter {
    parent = undefined;
    template = undefined;
    events = {};
    model = undefined;
    options = {};
    views = {};
    hidden = false;
    removed = false;
    eventListeners = {};
    debugLogger = localStorage.debugViews ? new Logger('view', this.constructor.name) : undefined;

    constructor(model = undefined, options = {}) {
        super();

        this.model = model;
        this.options = options;

        this.setMaxListeners(100);
    }

    render(templateData) {
        if (this.removed) {
            return;
        }

        let ts;
        if (this.debugLogger) {
            this.debugLogger.debug('Render start');
            ts = this.debugLogger.ts();
        }

        if (this.el) {
            Tip.destroyTips(this.el);
        }

        this.renderElement(templateData);

        Tip.createTips(this.el);

        this.debugLogger && this.debugLogger.debug('Render finished', this.debugLogger.ts(ts));

        return this;
    }

    renderElement(templateData) {
        const html = this.template(templateData);
        if (this.el) {
            const mountRoot = this.options.ownParent ? this.el.firstChild : this.el;
            morphdom(mountRoot, html);
        } else {
            let parent = this.options.parent || this.parent;
            if (parent) {
                if (typeof parent === 'string') {
                    parent = document.querySelector(parent);
                }
                if (!parent) {
                    throw new Error(`Error rendering ${this.constructor.name}: parent not found`);
                }
                if (this.options.replace) {
                    Tip.destroyTips(parent);
                    parent.innerHTML = '';
                }
                const el = document.createElement('div');
                el.innerHTML = html;
                const root = el.firstChild;
                if (this.options.ownParent) {
                    if (root) {
                        parent.appendChild(root);
                    }
                    this.el = parent;
                } else {
                    this.el = root;
                    parent.appendChild(this.el);
                }
                this.bindEvents();
            } else {
                throw new Error(
                    `Error rendering ${this.constructor.name}: I don't know how to insert the view`
                );
            }
            this.$el = $(this.el); // legacy
        }
    }

    bindEvents() {
        const eventsMap = {};
        for (const [eventDef, method] of Object.entries(this.events)) {
            const spaceIx = eventDef.indexOf(' ');
            let event, selector;
            if (spaceIx > 0) {
                event = eventDef.substr(0, spaceIx);
                selector = eventDef.substr(spaceIx + 1);
                if (OnlyDirectEvents[event]) {
                    throw new Error(
                        `Event listener ${eventDef} defined in ${this.constructor.name} ` +
                            `can be installed only on the view itself`
                    );
                }
            } else {
                event = eventDef;
            }
            if (!eventsMap[event]) {
                eventsMap[event] = [];
            }
            eventsMap[event].push({ selector, method });
        }
        for (const [event, handlers] of Object.entries(eventsMap)) {
            this.debugLogger && this.debugLogger.debug('Bind', event, handlers);
            const listener = e => this.eventListener(e, handlers);
            this.eventListeners[event] = listener;
            this.el.addEventListener(event, listener);
        }
    }

    unbindEvents() {
        for (const [event, listener] of Object.entries(this.eventListeners)) {
            this.el.removeEventListener(event, listener);
        }
    }

    eventListener(e, handlers) {
        this.debugLogger && this.debugLogger.debug('Listener fired', e.type);
        for (const { selector, method } of handlers) {
            if (selector) {
                const closest = e.target.closest(selector);
                if (!closest || !this.el.contains(closest)) {
                    continue;
                }
            }
            if (!this[method]) {
                this.debugLogger && this.debugLogger.debug('Method not defined', method);
                continue;
            }
            this.debugLogger && this.debugLogger.debug('Handling event', e.type, method);
            this[method](e);
        }
    }

    remove() {
        this.emit('remove');

        this.removeInnerViews();
        Tip.hideTips(this.el);
        this.el.remove();
        this.removed = true;

        this.debugLogger && this.debugLogger.debug('Remove');
    }

    removeInnerViews() {
        if (this.views) {
            for (const view of Object.values(this.views)) {
                if (view) {
                    if (view instanceof Array) {
                        view.forEach(v => v.remove());
                    } else {
                        view.remove();
                    }
                }
            }
            this.views = {};
        }
    }

    listenTo(model, event, callback) {
        const boundCallback = callback.bind(this);
        model.on(event, boundCallback);
        this.once('remove', () => model.off(event, boundCallback));
    }

    hide() {
        Tip.hideTips(this.el);
        return this.toggle(false);
    }

    show() {
        return this.toggle(true);
    }

    toggle(visible) {
        this.debugLogger && this.debugLogger.debug(visible ? 'Show' : 'Hide');
        if (visible === undefined) {
            visible = this.hidden;
        }
        this.hidden = !visible;
        this.emit(visible ? 'show' : 'hide');
        if (this.el) {
            this.el.classList.toggle('show', !!visible);
            this.el.classList.toggle('hide', !visible);
            if (!visible) {
                Tip.hideTips(this.el);
            }
        }
    }

    isHidden() {
        return this.hidden;
    }

    isVisible() {
        return !this.hidden;
    }

    afterPaint(callback) {
        requestAnimationFrame(() => requestAnimationFrame(callback));
    }

    onKey(key, handler, shortcut, modal, noPrevent) {
        KeyHandler.onKey(key, handler, this, shortcut, modal, noPrevent);
        this.once('remove', () => KeyHandler.offKey(key, handler, this));
    }

    off(event, listener) {
        if (listener === undefined) {
            return super.removeAllListeners(event);
        } else {
            return super.off(event, listener);
        }
    }
}

export { View };