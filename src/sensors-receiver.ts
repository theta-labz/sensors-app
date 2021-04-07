import '@google/model-viewer'
import { customElement } from '@lit/reactive-element/decorators/custom-element.js'
import Centrifuge from 'centrifuge'
import { html, render } from 'lit-html'
import * as QRCode from 'qrcode'
import * as UUID from 'uuid'
import {
    CentrifugoConnectionInfo,
    CentrifugoDisconnectionInfo,
    ConnectionState,
    DEFAULT_MOTION_STATE,
    DEFAULT_ROTATION_STATE,
    DiscoveryMessage,
    Message,
    MotionSensorMessage,
    OrientationSensorMessage,
    PairingState,
} from './constants'
import { adoptStyles, css } from './internal/css-tag'
import { ReactiveElement } from './internal/reactive-element'

@customElement('sensors-receiver')
export class SensorsReceiverElement extends ReactiveElement {
    static readonly styles = css`
        sensors-receiver {
            background-color: hsl(240deg 10% 6%);
            color: hsl(0deg 0% 100%);
            display: grid;
            gap: var(--composition-gap);
            grid: auto / repeat(var(--composition-columns), 1fr);
            padding: var(--composition-margin);
        }

        .sensors-receiver__connection-headline,
        .sensors-receiver__pairing-headline {
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: calc(9rem / 4);
            font-weight: 500;
            grid-column: span 4;
            margin-block: unset;
            place-self: center;
            text-align: center;
        }

        .sensors-receiver__pairing-qrcode {
            border: medium solid hsl(0deg 0% 100%);
            border-radius: 1rem;
            place-self: center;
        }

        .sensors-receiver__session-model {
            background-color: hsl(0deg 0% 100%);
            border-radius: 1rem;
            block-size: auto;
            clip-path: inset(0 round 1rem);
            inline-size: auto;
        }

        .sensors-receiver__session-section {
            color: hsl(0deg 0% 100%);
            grid-column: span 4;
        }

        @media (orientation: landscape) {
            .sensors-receiver__pairing-qrcode,
            .sensors-receiver__session-model {
                grid-column: span 5;
            }
        }

        @media (orientation: portrait) {
            .sensors-receiver__pairing-qrcode,
            .sensors-receiver__session-model {
                grid-column: span 4;
                min-block-size: calc(100vh - 2 * var(--composition-margin));
            }
        }
    `

    protected readonly _connection = new Centrifuge(import.meta.env.SNOWPACK_PUBLIC_CENTRIFUGO_WEBSOCKET)
    protected _subscription?: Centrifuge.Subscription

    protected _connectionState: ConnectionState = 'disconnected'
    protected _pairingState: PairingState = 'pairing'
    protected _receiverId: string = ''
    protected _senderId: string = ''
    protected _latency: number = 0

    protected readonly _channel = new URL(location.href).searchParams.get('channel') ?? UUID.v4()

    protected _orientation = DEFAULT_ROTATION_STATE
    protected _acceleration = DEFAULT_MOTION_STATE
    protected _accelerationIncludingGravity = DEFAULT_MOTION_STATE
    protected _rotationRate = DEFAULT_ROTATION_STATE

    protected _onConnected(ctx: CentrifugoConnectionInfo) {
        console.log('connected', ctx)

        // Set connection info.
        this._connectionState = 'connected'
        this._pairingState = 'pairing'
        this._receiverId = ctx.client
        this._latency = ctx.latency

        // Request reactive update.
        this.requestUpdate()

        // Subscribe to session channel.
        this._subscription = this._connection.subscribe(`sensors_${this._channel}`, {
            publish: this._onReceive.bind(this),
            subscribe: this._onSubscribe.bind(this),
            unsubscribe: this._onUnsubscribe.bind(this),
            error: this._onUnsubscribe.bind(this),
        })
    }

    protected _onDisconnected(ctx: CentrifugoDisconnectionInfo) {
        console.log('disconnected', ctx)

        // Reset connection info.
        this._connectionState = 'disconnected'
        this._pairingState = 'pairing'
        this._receiverId = ''
        this._senderId = ''
        this._latency = 0

        // Reset sensor info.
        this._orientation = DEFAULT_ROTATION_STATE
        this._acceleration = DEFAULT_MOTION_STATE
        this._accelerationIncludingGravity = DEFAULT_MOTION_STATE
        this._rotationRate = DEFAULT_ROTATION_STATE

        // Request reactive update.
        this.requestUpdate()
    }

    protected _onSubscribe(ctx: unknown) {
        console.log('subscribe', ctx)
    }

    protected _onUnsubscribe(ctx: unknown) {
        console.log('unsubscribe', ctx)

        // Reset subscription to session channel.
        this._subscription = undefined

        // Reset connection.
        if (this._connectionState !== 'disconnected') {
            this._connection.disconnect()
        }
    }

    protected _onReceive(ctx: Centrifuge.PublicationContext) {
        console.log('receive', ctx)

        if (this._pairingState === 'pairing') {
            if ((ctx.data as Message).kind !== 'discovery' && (ctx.data as DiscoveryMessage).role !== 'sender') {
                return
            }

            // Send discovery message.
            const message: DiscoveryMessage = {
                kind: 'discovery',
                role: 'receiver',
            }
            this._subscription!.publish(message)

            // Update connection info.
            this._pairingState = 'paired'
            this._senderId = ctx.info!.client!

            // Request reactive update.
            this.requestUpdate()
            return
        }

        if (this._pairingState !== 'paired') {
            return
        }

        if ((ctx.data as Message).kind === 'orientation_sensor') {
            // Update sensor state.
            this._orientation = (ctx.data as OrientationSensorMessage).orientation

            // Request reactive update.
            this.requestUpdate()
            return
        }

        if ((ctx.data as Message).kind === 'motion_sensor') {
            // Update sensor state.
            this._acceleration = (ctx.data as MotionSensorMessage).acceleration
            this._accelerationIncludingGravity = (ctx.data as MotionSensorMessage).accelerationIncludingGravity
            this._rotationRate = (ctx.data as MotionSensorMessage).rotationRate

            // Request reactive update.
            this.requestUpdate()
            return
        }
    }

    constructor() {
        super()
        this._connection.setToken(import.meta.env.SNOWPACK_PUBLIC_CENTRIFUGO_TOKEN)
        this._connection.on('connect', this._onConnected.bind(this))
        this._connection.on('disconnect', this._onDisconnected.bind(this))
    }

    protected connectedCallback() {
        adoptStyles(this.ownerDocument, (this.constructor as typeof SensorsReceiverElement).styles)

        // Update connection state.
        this._connectionState = 'connecting'
        this._connection.connect()

        super.connectedCallback()
    }

    protected disconnectedCallback() {
        this._connection.disconnect()
    }

    get template() {
        if (this._connectionState === 'disconnected') {
            return html`<h1 class="sensors-receiver__connection-headline">Disconnected</h1>`
        }

        if (this._connectionState === 'connecting') {
            return html`<h1 class="sensors-receiver__connection-headline">Connecting to Centrifugo...</h1>`
        }

        if (this._connectionState !== 'connected') {
            return
        }

        if (this._pairingState === 'pairing') {
            return html`
                <h1 class="sensors-receiver__pairing-headline">Scan the QR code to continue</h1>
                <canvas class="sensors-receiver__pairing-qrcode"></canvas>
            `
        }

        if (this._pairingState !== 'paired') {
            return
        }

        return html`
            <section class="sensors-receiver__session-section">
                <h1>Remote: ${this._senderId}</h1>
                <h2>Orientation sensor</h2>
                <ul>
                    <li>Alpha: ${this._orientation.alpha.toPrecision(3)}deg</li>
                    <li>Beta: ${this._orientation.beta.toPrecision(3)}deg</li>
                    <li>Gamma: ${this._orientation.gamma.toPrecision(3)}deg</li>
                </ul>

                <h2>Acceleration sensor (without Gravity)</h2>
                <ul>
                    <li>X: ${this._acceleration.x.toPrecision(3)}m/s</li>
                    <li>Y: ${this._acceleration.y.toPrecision(3)}m/s</li>
                    <li>Z: ${this._acceleration.z.toPrecision(3)}m/s</li>
                </ul>

                <h2>Acceleration sensor (with Gravity)</h2>
                <ul>
                    <li>X: ${this._accelerationIncludingGravity.x.toPrecision(3)}m/s</li>
                    <li>Y: ${this._accelerationIncludingGravity.y.toPrecision(3)}m/s</li>
                    <li>Z: ${this._accelerationIncludingGravity.z.toPrecision(3)}m/s</li>
                </ul>

                <h2>Rotation rate sensor</h2>
                <ul>
                    <li>Alpha: ${this._rotationRate.alpha.toPrecision(3)}deg</li>
                    <li>Beta: ${this._rotationRate.beta.toPrecision(3)}deg</li>
                    <li>Gamma: ${this._rotationRate.gamma.toPrecision(3)}deg</li>
                </ul>
            </section>
            <model-viewer
                class="sensors-receiver__session-model"
                alt="A 3D model of a Google Pixel Case"
                src="/assets/models/pixel_case.gltf"
                skybox-image="/assets/models/pillars_1k.hdr"
                environment-image="/assets/models/pillars_1k.hdr"
                exposure="1.25"
                orientation="${180 - this._orientation.gamma}deg ${this._orientation.beta}deg ${this._orientation
                    .alpha}deg"
                camera-controls
            ></model-viewer>
        `
    }

    protected update() {
        render(this.template, this, { host: this })
    }

    protected updatedCallback() {
        if (this._connectionState !== 'connected') return

        if (this._pairingState === 'pairing') {
            const canvas = this.querySelector('.sensors-receiver__pairing-qrcode')
            if (!canvas) return

            const url = new URL('/sender', location.href)
            url.searchParams.set('channel', this._channel)

            QRCode.toCanvas(canvas, url.toString(), {
                errorCorrectionLevel: 'high',
                color: {
                    dark: '#fff',
                    light: '#0e0e11',
                },
                scale: 8,
            })
            return
        }

        if (this._pairingState !== 'paired') return

        const viewer: any = this.querySelector('.sensors-receiver__session-model')
        viewer?.updateFraming()
    }
}
