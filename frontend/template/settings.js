import { readConfig } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
	// Activeer alleen de settings-logica op de settingspagina.
	const page = document.body.dataset.page;

	if (page === 'settings') {
		initSettingsPage();
	}
});

function initSettingsPage() {
	// Verzamel het formulier en alle velden die de preview en acties aansturen.
	const form = document.getElementById('settings-form');
	if (!form) {
		return;
	}

	const fields = {
		hypervisor: form.querySelector('#hypervisor'),
		hostIp: form.querySelector('#hostIp'),
		port: form.querySelector('#port'),
		useHttps: Array.from(form.querySelectorAll('input[name="useHttps"]')),
		apiKey: form.querySelector('#apiKey'),
		secret: form.querySelector('#secret'),
	};

	const previewEndpoint = form.parentElement.querySelector('[data-preview-endpoint]');
	const previewHypervisor = form.parentElement.querySelector('[data-preview-hypervisor]');
	const previewProtocol = form.parentElement.querySelector('[data-preview-protocol]');
	const previewStatus = form.parentElement.querySelector('[data-preview-status]');
	const saveState = form.querySelector('[data-save-state]');
	const saveButton = form.querySelector('[data-save-config]');
	const resetButton = form.querySelector('[data-reset-config]');
	const secretStored = form.dataset.secretStored === '1';

	const syncPreview = () => {
		// Houd de rechter preview synchroon met wat de gebruiker invult.
		const config = readConfig(fields);

		if (previewEndpoint) {
			previewEndpoint.textContent = config.hostIp && config.port ? `${config.hostIp}:${config.port}` : 'Nog geen endpoint';
		}

		if (previewHypervisor) {
			previewHypervisor.textContent = config.hypervisor || 'Niet ingesteld';
		}

		if (previewProtocol) {
			previewProtocol.textContent = config.useHttps ? 'HTTPS' : 'HTTP';
		}

		if (previewStatus) {
			previewStatus.textContent = config.secret
				? 'Nieuwe secret klaar om op te slaan'
				: (secretStored ? 'Secret versleuteld opgeslagen' : 'Geen secret ingesteld');
		}
	};

	const saveConfig = async () => {
		// Sla de huidige waarden op via de backend en toon daarna de status.
		const payload = readConfig(fields);
		const response = await fetch('/settings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			throw new Error('Opslaan naar config.json mislukt.');
		}

		if (saveState) {
			saveState.textContent = 'Configuratie opgeslagen in config.json. Secret wordt versleuteld bewaard.';
		}

		syncPreview();
	};

	const resetDraft = () => {
		// Wis alleen het concept in het formulier, zonder direct serverdata te veranderen.
		Object.values(fields).forEach((field) => {
			if (Array.isArray(field)) {
				field.forEach((radio) => {
					radio.checked = radio.value === 'false';
				});
			} else if (field) {
				field.value = field.id === 'secret' ? '' : '';
			}
		});

		if (saveState) {
			saveState.textContent = 'Concept is leeggemaakt.';
		}

		syncPreview();
	};

	Object.values(fields).forEach((field) => {
		// Update de preview live zodra een veld wijzigt.
		if (Array.isArray(field)) {
			field.forEach((radio) => {
				radio.addEventListener('change', () => {
					syncPreview();
				});
			});
		} else if (field) {
			field.addEventListener('input', () => {
				syncPreview();
			});
		}
	});

	if (saveButton) {
		// Koppel de opslaan-knop aan de async save flow.
		saveButton.addEventListener('click', () => {
			saveConfig().catch((error) => {
				if (saveState) {
					saveState.textContent = error.message;
				}
			});
		});
	}

	if (resetButton) {
		// Koppel de reset-knop aan het leegmaken van het formulier.
		resetButton.addEventListener('click', resetDraft);
	}

	syncPreview();
}