class ModalManager {
    constructor({ transitionMs = 300 } = {}) {
        this.transitionMs = transitionMs;
        this.entries = new Map();
        this.stack = [];
        this.pendingHide = new Map();
    }

    register(overlay, { requestClose, initialFocus } = {}) {
        if (!overlay || this.entries.has(overlay)) return;
        const entry = {
            overlay,
            requestClose: typeof requestClose === 'function' ? requestClose : () => this.close(overlay),
            initialFocus: initialFocus || null,
            returnFocus: null
        };
        this.entries.set(overlay, entry);
        overlay.hidden = true;
        overlay.inert = true;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.addEventListener('pointerdown', event => {
            if (event.target === overlay && this.top() === overlay) entry.requestClose('backdrop');
        });
    }

    top() {
        return this.stack.length ? this.stack[this.stack.length - 1] : null;
    }

    hasOpenModal() {
        return this.stack.length > 0;
    }

    open(overlay, trigger = document.activeElement) {
        const entry = this.entries.get(overlay);
        if (!entry) throw new Error('Modal must be registered before open()');
        this._cancelPendingHide(overlay);
        const oldTop = this.top();
        if (oldTop && oldTop !== overlay) {
            oldTop.inert = true;
            oldTop.setAttribute('aria-hidden', 'true');
        }
        this.stack = this.stack.filter(item => item !== overlay);
        this.stack.push(overlay);
        if (trigger instanceof HTMLElement && !trigger.closest('.modal-overlay')) {
            entry.returnFocus = trigger;
        }
        overlay.hidden = false;
        overlay.inert = false;
        overlay.setAttribute('aria-hidden', 'false');
        overlay.classList.add('active');
        overlay.style.zIndex = String(1000 + this.stack.length);
        requestAnimationFrame(() => {
            if (this.top() !== overlay) return;
            const preferred = typeof entry.initialFocus === 'string'
                ? overlay.querySelector(entry.initialFocus)
                : entry.initialFocus;
            (preferred || this._focusables(overlay)[0] || overlay.querySelector('.modal'))?.focus();
        });
    }

    close(overlay, { restoreFocus = true } = {}) {
        const entry = this.entries.get(overlay);
        if (!entry) return;
        overlay.classList.remove('active');
        overlay.inert = true;
        overlay.setAttribute('aria-hidden', 'true');
        this.stack = this.stack.filter(item => item !== overlay);
        const nextTop = this.top();
        if (nextTop) {
            nextTop.inert = false;
            nextTop.setAttribute('aria-hidden', 'false');
        }

        const finish = () => {
            this._cancelPendingHide(overlay);
            if (!overlay.classList.contains('active')) {
                overlay.hidden = true;
                overlay.style.removeProperty('z-index');
                entry.returnFocus = null;
            }
        };
        const onEnd = event => {
            if (event.target === overlay && event.propertyName === 'opacity') finish();
        };
        overlay.addEventListener('transitionend', onEnd);
        const timer = setTimeout(finish, this.transitionMs);
        this.pendingHide.set(overlay, { timer, onEnd });

        if (restoreFocus) {
            queueMicrotask(() => {
                const target = entry.returnFocus;
                if (target?.isConnected && !target.hidden && !target.closest('[inert]')) target.focus();
            });
        }
    }

    closeAll({ restoreFocus = false } = {}) {
        [...this.stack].reverse().forEach(overlay => this.close(overlay, { restoreFocus }));
    }

    handleKeyDown(event) {
        const overlay = this.top();
        if (!overlay) return false;
        const entry = this.entries.get(overlay);
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            entry.requestClose('escape');
            return true;
        }
        if (event.key === 'Tab') {
            this._trapTab(event, overlay);
            return true;
        }
        return true;
    }

    _focusables(overlay) {
        return [...overlay.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), '
            + 'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )].filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
    }

    _trapTab(event, overlay) {
        const focusables = this._focusables(overlay);
        if (!focusables.length) {
            event.preventDefault();
            overlay.querySelector('.modal')?.focus();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    _cancelPendingHide(overlay) {
        const pending = this.pendingHide.get(overlay);
        if (!pending) return;
        clearTimeout(pending.timer);
        overlay.removeEventListener('transitionend', pending.onEnd);
        this.pendingHide.delete(overlay);
    }
}

if (typeof window !== 'undefined') window.ModalManager = ModalManager;
