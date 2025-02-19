export class NonError extends Error {
	name = 'NonError';

	constructor(message) {
		super(NonError._prepareSuperMessage(message));
	}

	static _prepareSuperMessage(message) {
		try {
			return JSON.stringify(message);
		} catch {
			return String(message);
		}
	}
}

const commonProperties = [
	{
		property: 'name',
		enumerable: false,
	},
	{
		property: 'message',
		enumerable: false,
	},
	{
		property: 'stack',
		enumerable: false,
	},
	{
		property: 'code',
		enumerable: true,
	},
	{
		property: 'cause',
		enumerable: false,
	},
];

const toJsonWasCalled = Symbol('.toJSON was called');

const toJSON = from => {
	from[toJsonWasCalled] = true;
	const json = from.toJSON();
	delete from[toJsonWasCalled];
	return json;
};

const destroyCircular = ({
	from,
	seen,
	to_,
	forceEnumerable,
	maxDepth,
	depth,
}) => {
	const to = to_ || (Array.isArray(from) ? [] : {});

	seen.push(from);

	if (depth >= maxDepth) {
		return to;
	}

	if (typeof from.toJSON === 'function' && from[toJsonWasCalled] !== true) {
		return toJSON(from);
	}

	for (const [key, value] of Object.entries(from)) {
		// eslint-disable-next-line node/prefer-global/buffer
		if (typeof Buffer === 'function' && Buffer.isBuffer(value)) {
			to[key] = '[object Buffer]';
			continue;
		}

		// TODO: Use `stream.isReadable()` when targeting Node.js 18.
		if (value !== null && typeof value === 'object' && typeof value.pipe === 'function') {
			to[key] = '[object Stream]';
			continue;
		}

		if (typeof value === 'function') {
			continue;
		}

		if (!value || typeof value !== 'object') {
			to[key] = value;
			continue;
		}

		if (!seen.includes(from[key])) {
			depth++;

			to[key] = destroyCircular({
				from: from[key],
				seen: [...seen],
				forceEnumerable,
				maxDepth,
				depth,
			});
			continue;
		}

		to[key] = '[Circular]';
	}

	for (const {property, enumerable} of commonProperties) {
		if (typeof from[property] !== 'undefined' && from[property] !== null) {
			Object.defineProperty(to, property, {
				value: from[property],
				enumerable: forceEnumerable ? true : enumerable,
				configurable: true,
				writable: true,
			});
		}
	}

	return to;
};

export function serializeError(value, options = {}) {
	const {maxDepth = Number.POSITIVE_INFINITY} = options;

	if (typeof value === 'object' && value !== null) {
		return destroyCircular({
			from: value,
			seen: [],
			forceEnumerable: true,
			maxDepth,
			depth: 0,
		});
	}

	// People sometimes throw things besides Error objects…
	if (typeof value === 'function') {
		// `JSON.stringify()` discards functions. We do too, unless a function is thrown directly.
		return `[Function: ${(value.name || 'anonymous')}]`;
	}

	return value;
}

export function deserializeError(value, options = {}) {
	const {maxDepth = Number.POSITIVE_INFINITY} = options;

	if (value instanceof Error) {
		return value;
	}

	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const newError = new Error(); // eslint-disable-line unicorn/error-message
		destroyCircular({
			from: value,
			seen: [],
			to_: newError,
			maxDepth,
			depth: 0,
		});
		return newError;
	}

	return new NonError(value);
}
