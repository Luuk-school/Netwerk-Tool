export function readConfig(fields) {
	const protocolFields = Array.isArray(fields.useHttps) ? fields.useHttps : [];
	const useHttpsField = protocolFields.find((field) => field.checked);

	return {
		hypervisor: fields.hypervisor ? fields.hypervisor.value.trim() : '',
		hostIp: fields.hostIp ? fields.hostIp.value.trim() : '',
		port: fields.port ? fields.port.value.trim() : '',
		useHttps: useHttpsField ? useHttpsField.value === 'true' : false,
		apiKey: fields.apiKey ? fields.apiKey.value.trim() : '',
		secret: fields.secret ? fields.secret.value.trim() : '',
	};
}

export function applyConfig(fields, config) {
	if (fields.hypervisor) {
		fields.hypervisor.value = config.hypervisor || '';
	}

	if (fields.hostIp) {
		fields.hostIp.value = config.hostIp || '';
	}

	if (fields.port) {
		fields.port.value = config.port || '';
	}

	if (fields.useHttps) {
		const shouldUseHttps = Boolean(config.useHttps);
		fields.useHttps.forEach((field) => {
			field.checked = field.value === String(shouldUseHttps);
		});
	}

	if (fields.apiKey) {
		fields.apiKey.value = config.apiKey || '';
	}

	if (fields.secret) {
		fields.secret.value = '';
	}
}