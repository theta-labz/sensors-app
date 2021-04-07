export type ConnectionState = 'connecting' | 'connected' | 'disconnected'
export type PairingState = 'pairing' | 'paired'

export type MotionState = {
    x: number
    y: number
    z: number
}

export type RotationState = {
    alpha: number
    beta: number
    gamma: number
}

export const DEFAULT_MOTION_STATE: MotionState = { x: 0, y: 0, z: 0 }
export const DEFAULT_ROTATION_STATE: RotationState = { alpha: 0, beta: 0, gamma: 0 }

export type CentrifugoConnectionInfo = {
    client: string
    latency: number
    transport: string
}

export type CentrifugoDisconnectionInfo = {
    reason: string
    reconnect: boolean
}

export type DiscoveryMessage = {
    kind: 'discovery'
    role: 'sender' | 'receiver'
}

export type OrientationSensorMessage = {
    kind: 'orientation_sensor'
    orientation: RotationState
}

export type MotionSensorMessage = {
    kind: 'motion_sensor'
    acceleration: MotionState
    accelerationIncludingGravity: MotionState
    rotationRate: RotationState
}

export type Message = DiscoveryMessage | OrientationSensorMessage | MotionSensorMessage
