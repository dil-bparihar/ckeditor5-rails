class CKEditorContextComponent extends HTMLElement {
  static get observedAttributes() {
    return ['plugins', 'config'];
  }

  /** @type {import('ckeditor5').Context|null} */
  instance = null;

  /** @type {Promise<import('ckeditor5').Context>} */
  instancePromise = Promise.withResolvers();

  /** @type {Set<CKEditorComponent>} */
  #connectedEditors = new Set();

  /** @type {String} Attributes checksum hash */
  #integrity = '';

  async connectedCallback() {
    this.#integrity = this.getAttribute('integrity');

    try {
      execIfDOMReady(() => this.#initializeContext());
    } catch (error) {
      console.error('Failed to initialize context:', error);
      this.dispatchEvent(new CustomEvent('context-error', { detail: error }));
    }
  }

  async attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== null && oldValue !== newValue) {
      await this.#initializeContext();
    }
  }

  async disconnectedCallback() {
    if (this.instance) {
      await this.instance.destroy();
      this.instance = null;
    }
  }

  /**
   * Register editor component with this context
   *
   * @param {CKEditorComponent} editor
   */
  registerEditor(editor) {
    this.#connectedEditors.add(editor);
  }

  /**
   * Unregister editor component from this context
   *
   * @param {CKEditorComponent} editor
   */
  unregisterEditor(editor) {
    this.#connectedEditors.delete(editor);
  }

  /**
   * Validates editor configuration integrity hash to prevent attacks.
   */
  async #validateIntegrity() {
    const integrity = await calculateChecksum({
      plugins: this.getAttribute('plugins'),
    });

    if (integrity !== this.#integrity) {
      throw new Error(
        'Configuration integrity check failed. It means that #integrity attributes mismatch from attributes passed to webcomponent. ' +
        'This could be a security issue. Please check if you are passing correct attributes to the webcomponent.'
      );
    }
  }

  /**
   * Initialize CKEditor context with shared configuration
   *
   * @private
   */
  async #initializeContext() {
    if (this.instance) {
      this.instancePromise = Promise.withResolvers();

      await this.instance.destroy();

      this.instance = null;
    }

    await this.#validateIntegrity();

    const { Context, ContextWatchdog } = await import('ckeditor5');
    const plugins = await this.#getPlugins();
    const config = this.#getConfig();

    this.instance = new ContextWatchdog(Context, {
      crashNumberLimit: 10
    });

    await this.instance.create({
      ...config,
      plugins
    });

    this.instance.on('itemError', (...args) => {
      console.error('Context item error:', ...args);
    });

    this.instancePromise.resolve(this.instance);
    this.dispatchEvent(new CustomEvent('context-ready', { detail: this.instance }));

    // Reinitialize connected editors.
    await Promise.all(
      [...this.#connectedEditors].map(editor => editor.reinitializeEditor())
    );
  }

  async #getPlugins() {
    const raw = this.getAttribute('plugins');

    return loadAsyncImports(raw ? JSON.parse(raw) : []);
  }

  /**
   * Gets context configuration with resolved element references.
   *
   * @private
   */
  #getConfig() {
    const config = JSON.parse(this.getAttribute('config') || '{}');

    return resolveElementReferences(config);
  }
}

customElements.define('ckeditor-context-component', CKEditorContextComponent);
