import { customElement } from '@lit/reactive-element/decorators/custom-element.js'
import Centrifuge from 'centrifuge'
import { html, render } from 'lit-html'
import * as UUID from 'uuid'
import type {
    CentrifugoConnectionInfo,
    CentrifugoDisconnectionInfo,
    ConnectionState,
    DiscoveryMessage,
    MotionSensorMessage,
    OrientationSensorMessage,
    PairingState,
} from './constants'
import { adoptStyles, css } from './internal/css-tag'
import { ReactiveElement } from './internal/reactive-element'

@customElement('sensors-sender')
export class SensorsSenderElement extends ReactiveElement {
    static readonly styles = css`
        sensors-sender {
            background-color: hsl(240deg 10% 6%);
            color: hsl(0deg 0% 100%);
            display: grid;
            gap: var(--composition-gap);
            grid: auto / repeat(var(--composition-columns), 1fr);
            padding: var(--composition-margin);
        }

        .sensors-sender__connection-headline,
        .sensors-sender__pairing-headline,
        .sensors-sender__session-headline {
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: calc(9rem / 4);
            font-weight: 500;
            grid-column: 1 / -1;
            margin-block: unset;
            place-self: center;
            text-align: center;
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

    protected _prevMotionTS = 0

    protected _onConnected(ctx: CentrifugoConnectionInfo) {
        console.log('connected', ctx)

        // Set connection info.
        this._connectionState = 'connected'
        this._pairingState = 'pairing'
        this._senderId = ctx.client
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

        // Reset internal state.
        this._prevMotionTS = 0

        // Request reactive update.
        this.requestUpdate()
    }

    protected _onSubscribe(ctx: unknown) {
        console.log('subscribe', ctx)

        // Send discovery message.
        const message: DiscoveryMessage = {
            kind: 'discovery',
            role: 'sender',
        }
        this._subscription!.publish(message)
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

        if (
            this._pairingState !== 'pairing' ||
            ((ctx.data as DiscoveryMessage).kind !== 'discovery' && (ctx.data as DiscoveryMessage).role !== 'receiver')
        ) {
            return
        }

        // Update connection info.
        this._pairingState = 'paired'
        this._receiverId = ctx.info!.client!

        // Request reactive update.
        this.requestUpdate()
        return
    }

    protected _onDeviceOrientation(event: DeviceOrientationEvent) {
        if (this._pairingState !== 'paired') return

        // Send orientation sensor message.
        const message: OrientationSensorMessage = {
            kind: 'orientation_sensor',
            orientation: {
                alpha: event.alpha ?? 0,
                beta: event.beta ?? 0,
                gamma: event.gamma ?? 0,
            },
        }
        this._subscription?.publish(message)
    }

    protected _onDeviceMotion(event: DeviceMotionEvent) {
        if (this._pairingState !== 'paired') return

        // Timeout.
        if (event.timeStamp - this._prevMotionTS < 200) return
        this._prevMotionTS = event.timeStamp

        // Send motion sensor message.
        const message: MotionSensorMessage = {
            kind: 'motion_sensor',
            acceleration: {
                x: event.acceleration?.x ?? 0,
                y: event.acceleration?.y ?? 0,
                z: event.acceleration?.z ?? 0,
            },
            accelerationIncludingGravity: {
                x: event.accelerationIncludingGravity?.x ?? 0,
                y: event.accelerationIncludingGravity?.y ?? 0,
                z: event.accelerationIncludingGravity?.z ?? 0,
            },
            rotationRate: {
                alpha: event.rotationRate?.alpha ?? 0,
                beta: event.rotationRate?.beta ?? 0,
                gamma: event.rotationRate?.gamma ?? 0,
            },
        }
        this._subscription?.publish(message)
    }

    constructor() {
        super()
        this._connection.setToken(import.meta.env.SNOWPACK_PUBLIC_CENTRIFUGO_TOKEN)
        this._connection.on('connect', this._onConnected.bind(this))
        this._connection.on('disconnect', this._onDisconnected.bind(this))
        globalThis.addEventListener('deviceorientation', this._onDeviceOrientation.bind(this))
        globalThis.addEventListener('devicemotion', this._onDeviceMotion.bind(this))
    }

    protected connectedCallback() {
        adoptStyles(this.ownerDocument, (this.constructor as typeof SensorsSenderElement).styles)

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
            return html`<h1 class="sensors-sender__connection-headline">Disconnected</h1>`
        }

        if (this._connectionState === 'connecting') {
            return html`<h1 class="sensors-sender__connection-headline">Connecting to Centrifugo...</h1>`
        }

        if (this._connectionState !== 'connected') {
            return
        }

        if (this._pairingState === 'pairing') {
            return html`<h1 class="sensors-sender__pairing-headline">Pairing...</h1>`
        }

        if (this._pairingState !== 'paired') {
            return
        }

        return html`<h1 class="sensors-sender__pairing-headline">Paired (${this._senderId})</h1>`
    }

    protected update() {
        render(this.template, this, { host: this })
    }
}
