import { customElement } from '@lit/reactive-element/decorators/custom-element.js'
import { Route, Router } from '@vaadin/router'
import { adoptStyles, css } from 'src/internal/css-tag'
import { ReactiveElement } from 'src/internal/reactive-element'

@customElement('sensors-app')
export class SensorsElement extends ReactiveElement {
    static readonly styles = css`
        :root {
            --composition-gap: calc(100vw / var(--composition-columns) / 6);
            --composition-margin: calc(100vw / var(--composition-columns) / 3);

            color-scheme: light dark;
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-feature-settings: 'liga', 'kern';
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
        }

        sensors-app {
            display: grid;
            grid: 'outlet' minmax(100vh, max-content) / minmax(100vw, max-content);
        }

        @media (orientation: landscape) {
            :root {
                --composition-columns: 9;
            }
        }

        @media (orientation: portrait) {
            :root {
                --composition-columns: 4;
            }
        }

        @media (prefers-color-scheme: light), (prefers-color-scheme: no-preference) {
            :root {
                scrollbar-color: light;
            }
        }

        @media (prefers-color-scheme: dark) {
            :root {
                scrollbar-color: dark;
            }
        }
    `

    static readonly routes: Route[] = [
        {
            path: '/receiver',
            component: 'sensors-receiver',
            async action() {
                await import('./sensors-receiver')
            },
        },
        {
            path: '/sender',
            component: 'sensors-sender',
            async action() {
                await import('./sensors-sender')
            },
        },
        {
            path: '/(.*)',
            redirect: '/receiver',
        },
    ]

    readonly router = new Router(this)

    protected connectedCallback() {
        adoptStyles(this.ownerDocument, (this.constructor as typeof SensorsElement).styles)
        this.router.setRoutes((this.constructor as typeof SensorsElement).routes)
        super.connectedCallback()
    }
}
