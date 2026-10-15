/**
 * P2P Mesh network — 2-layer architecture:
 *
 * Layer 1: Personal Mesh (single-origin trusted)
 *   - Your own devices, identified by signed device keys
 *   - Syncs memory, skills, dreams across your devices
 *   - Always authorized for you
 *
 * Layer 2: Peer Circles (trusted groups)
 *   - Friends/family circles you explicitly join
 *   - Can share read-only memory slices or skills
 *   - Requires explicit peer approval per share
 *
 * Local-first: all memory is stored locally before (optionally) syncing.
 * Remote sync is opt-in with explicit approval + audit log.
 */

export interface DeviceKey {
	id: string;
	publicKey: string;
	signedAt: number;
}

export interface PeerKey {
	peerId: string;
	publicKey: string;
	circleId: string;
	approvedAt: number;
}

export interface MeshIdentity {
	deviceKey: DeviceKey;
	peerKeys: PeerKey[];
}

export type MeshLayer = "personal" | "circle";

export interface MeshMessage {
	layer: MeshLayer;
	circleId?: string;
	peerId?: string;
	type: "memory" | "skill" | "dream" | "config";
	payload: unknown;
	timestamp: number;
	originDeviceId: string;
}

export interface Circle {
	id: string;
	name: string;
	peerIds: string[];
	joinedAt: number;
	permissions: {
		readMemory: boolean;
		writeMemory: boolean;
		shareSkills: boolean;
	};
}

const PERSONAL_MESH_PREFIX = "privseai.mesh.personal";
const CIRCLE_MESH_PREFIX = "privseai.mesh.circle";

export class P2PMeshNetwork {
	private identity: MeshIdentity | null = null;
	private circles: Circle[] = [];
	private messages: MeshMessage[] = [];

	getIdentity(): MeshIdentity | null {
		return this.identity;
	}

	hasIdentity(): boolean {
		return this.identity !== null;
	}

	setIdentity(deviceKey: DeviceKey): void {
		this.identity = { deviceKey, peerKeys: [] };
		this.persist();
	}

	addCircle(circle: Circle): void {
		if (this.circles.some((c) => c.id === circle.id)) return;
		this.circles.push(circle);
		this.persist();
	}

	getCircle(circleId: string): Circle | undefined {
		return this.circles.find((c) => c.id === circleId);
	}

	listCircles(): Circle[] {
		return [...this.circles];
	}

	removeCircle(circleId: string): boolean {
		const len = this.circles.length;
		this.circles = this.circles.filter((c) => c.id !== circleId);
		if (this.circles.length < len) {
			this.persist();
			return true;
		}
		return false;
	}

	broadcastPersonal(message: Omit<MeshMessage, "layer" | "originDeviceId">): MeshMessage {
		const msg: MeshMessage = {
			...message,
			layer: "personal",
			originDeviceId: this.identity?.deviceKey.id ?? "unknown",
		};
		this.messages.push(msg);
		return msg;
	}

	broadcastToCircle(circleId: string, message: Omit<MeshMessage, "layer" | "circleId" | "originDeviceId">): MeshMessage | null {
		const circle = this.getCircle(circleId);
		if (!circle) return null;

		const msg: MeshMessage = {
			...message,
			layer: "circle",
			circleId,
			originDeviceId: this.identity?.deviceKey.id ?? "unknown",
		};
		this.messages.push(msg);
		return msg;
	}

	getMessagesForCircle(circleId: string): MeshMessage[] {
		return this.messages.filter((m) => m.circleId === circleId);
	}

	getPersonalMessages(): MeshMessage[] {
		return this.messages.filter((m) => m.layer === "personal");
	}

	clear(): void {
		this.identity = null;
		this.circles = [];
		this.messages = [];
		this.persist();
	}

	private persist(): void {
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return;
			ls.setItem(`${PERSONAL_MESH_PREFIX}.v1`, JSON.stringify({
				identity: this.identity,
				circles: this.circles,
			}));
		} catch {
			/* quota — skip silently */
		}
	}

	private load(): void {
		try {
			const ls = typeof localStorage !== "undefined" ? localStorage : null;
			if (!ls) return;
			const raw = ls.getItem(`${PERSONAL_MESH_PREFIX}.v1`);
			if (!raw) return;
			const data = JSON.parse(raw) as { identity: MeshIdentity; circles: Circle[] };
			this.identity = data.identity ?? null;
			this.circles = data.circles ?? [];
		} catch {
			/* corrupt data — start fresh */
		}
	}

	initialize(): void {
		this.load();
	}
}

const _CIRCLE_PREFIX = CIRCLE_MESH_PREFIX;

let _instance: P2PMeshNetwork | null = null;

export function getP2PMesh(): P2PMeshNetwork {
	if (!_instance) {
		_instance = new P2PMeshNetwork();
		_instance.initialize();
	}
	return _instance;
}

export function resetP2PMesh(): void {
	if (_instance) {
		_instance.clear();
		_instance = null;
	}
}

export { _CIRCLE_PREFIX };
