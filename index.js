const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

let ultimoQR = '';
const NUMERO_ASESOR = '573023394951@s.whatsapp.net';
const sesiones = new Map();

// Ruta web para ver el QR escaneable
app.get('/', (req, res) => {
    if (!ultimoQR) {
        return res.send('<h2>⏳ El bot está iniciando o ya está conectado. Si ya vinculaste tu WhatsApp, ignora esta página.</h2>');
    }
    qrcode.toDataURL(ultimoQR, (err, url) => {
        if (err) return res.send('Error al generar el QR web.');
        res.send(`
            <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
                <h2>⚡ Escanea este QR para conectar Pro-Tech Maintenance ⚡</h2>
                <img src="${url}" alt="QR WhatsApp" style="width:300px; height:300px; border:2px solid #ccc; padding:10px; border-radius:10px;"/>
                <p>Actualiza la página si no lo reconoce de inmediato.</p>
            </div>
        `);
    });
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web de QR activo en el puerto ${PORT}`);
});

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Pro-Tech Bot', 'Chrome', '10.0']
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            ultimoQR = qr;
            console.log('\n[QR] Nuevo código QR generado. Entra a la URL de tu servicio en Render para escanearlo.\n');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Conexión cerrada (Código: ${statusCode}). Reconectando...`, shouldReconnect);
            if (shouldReconnect) {
                iniciarBot();
            }
        } else if (connection === 'open') {
            ultimoQR = '';
            console.log('\n==================================================');
            console.log('✅ ¡Bot Pro-Tech Maintenance conectado y persistente!');
            console.log('==================================================\n');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const usuario = msg.key.remoteJid;
        const texto = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ''
        ).trim().toLowerCase();

        if (!texto) return;

        // Comandos de control desde tu WhatsApp personal (Asesor)
        if (msg.key.remoteJid === NUMERO_ASESOR || msg.key.remoteJid.includes('573023394951')) {
            if (texto.startsWith('activar ') || texto.startsWith('reactivar ')) {
                const numeroLimpioInput = texto.replace('activar ', '').replace('reactivar ', '').trim();
                const numeroDestino = numeroLimpioInput.includes('@') ? numeroLimpioInput : numeroLimpioInput + '@s.whatsapp.net';
                
                if (sesiones.has(numeroDestino)) {
                    sesiones.set(numeroDestino, { paso: 'MENU_PRINCIPAL', tipoCliente: '', interes: '', nombre: '', detalle: '', atendidoPorHumano: false });
                    await sock.sendMessage(NUMERO_ASESOR, { text: `✅ ¡Listo, Juan! El bot ha sido REACTIVADO para el cliente con número ${numeroLimpioInput}. Volverá a responderle.` });
                } else {
                    await sock.sendMessage(NUMERO_ASESOR, { text: `⚠️ No encontré una sesión registrada con el número: ${numeroLimpioInput}` });
                }
                return;
            }
        }

        if (usuario.endsWith('@g.us')) return; // Ignorar grupos

        if (!sesiones.has(usuario)) {
            sesiones.set(usuario, { paso: 'INICIO', tipoCliente: '', interes: '', nombre: '', detalle: '', atendidoPorHumano: false });
        }
        const estado = sesiones.get(usuario);

        if (estado.atendidoPorHumano) return;

        if (texto === 'menu' || texto === 'menú' || texto === 'inicio') {
            estado.paso = 'MENU_PRINCIPAL';
            await sock.sendMessage(usuario, {
                text: '🔄 *Has vuelto al menú principal de Pro-Tech Maintenance.*\n\n' +
                      'Por favor, selecciona qué tipo de cliente eres:\n\n' +
                      '🏢 *1.* Empresa o Institución Educativa\n' +
                      '👤 *2.* Persona Natural / Particular\n\n' +
                      '_Escribe 1 o 2 para continuar._'
            });
            return;
        }

        switch (estado.paso) {
            case 'INICIO':
            case 'MENU_PRINCIPAL':
                if (texto === '1' || texto === 'empresa') {
                    estado.tipoCliente = 'Empresa / Institución';
                    estado.paso = 'PEDIR_NOMBRE';
                    await sock.sendMessage(usuario, { text: '🏢 *Excelente, enfoque empresarial seleccionado.*\n\nPor favor, dime: ¿Cuál es tu **nombre completo** o el de la persona encargada?' });
                } else if (texto === '2' || texto === 'particular') {
                    estado.tipoCliente = 'Persona Natural';
                    estado.paso = 'PEDIR_NOMBRE';
                    await sock.sendMessage(usuario, { text: '👤 *Entendido, atención particular seleccionada.*\n\nPor favor, dime: ¿Cuál es tu **nombre completo**?' });
                } else {
                    await sock.sendMessage(usuario, {
                        text: '👋 *¡Hola! Hablas con Eva, la asistente virtual de Pro-Tech Maintenance.*\n\n' +
                              'Para brindarte una mejor atención, dime:\n' +
                              '¿Para quién es el servicio?\n\n' +
                              '🏢 *1.* Empresa o Institución Educativa\n' +
                              '👤 *2.* Persona Natural / Particular\n\n' +
                              '_Escribe 1 o 2 para comenzar._'
                    });
                }
                break;

            case 'PEDIR_NOMBRE':
                estado.nombre = msg.message.conversation || msg.message.extendedTextMessage?.text || 'Cliente';
                estado.paso = 'SELECCIONAR_SERVICIO';
                
                if (estado.tipoCliente === 'Empresa / Institución') {
                    await sock.sendMessage(usuario, {
                        text: `Muchísimas gracias, *${estado.nombre}*.\n\n` +
                              '¿Qué tipo de solución tecnológica necesitas para tu organización?\n\n' +
                              '🔌 *1.* Redes de Datos y Cableado Estructurado (LAN/WLAN)\n' +
                              '🖥️ *2.* Instalación de Servidores Locales (DHCP, DNS, Web)\n' +
                              '⚡ *3.* Seguridad Eléctrica, Racks y Puesta a Tierra\n' +
                              '❓ *4.* Otro requerimiento o consulta general\n' +
                              '👨‍💻 *5.* Hablar directamente con un Asesor Humano\n\n' +
                              '_Escribe el número de tu opción._'
                    });
                } else {
                    await sock.sendMessage(usuario, {
                        text: `Muchísimas gracias, *${estado.nombre}*.\n\n` +
                              '¿En qué servicio estás interesado el día de hoy?\n\n' +
                              '🔌 *1.* Cableado y puntos de red para hogares/oficinas\n' +
                              '🛠️ *2.* Mantenimiento de equipos de cómputo y soporte\n' +
                              '🌐 *3.* Configuración de redes Wi-Fi y dispositivos\n' +
                              '❓ *4.* Otro requerimiento o consulta general\n' +
                              '👨‍💻 *5.* Hablar directamente con un Asesor Humano\n\n' +
                              '_Escribe el número de tu opción._'
                    });
                }
                break;

            case 'SELECCIONAR_SERVICIO':
                if (texto === '1' || texto === '2' || texto === '3' || texto === '4') {
                    const opcionesTexto = {
                        '1': 'Redes de Datos / Cableado Estructurado',
                        '2': 'Servidores Locales / Soporte Técnico',
                        '3': 'Seguridad Eléctrica y Racks',
                        '4': 'Consulta General u Otro Servicio'
                    };
                    estado.interes = opcionesTexto[texto];
                    estado.paso = 'PEDIR_DETALLE';

                    await sock.sendMessage(usuario, {
                        text: `📝 *¡Perfecto!*\n\n` +
                              `Para terminar, cuéntame brevemente en un mensaje: ¿Qué problema específico tienes o qué detalle adicional debemos saber sobre tu requerimiento?`
                    });
                } else if (texto === '5' || texto === 'asesor') {
                    estado.interes = 'Solicitud directa de Asesor';
                    estado.detalle = 'El cliente solicitó asesor directo sin especificar área.';
                    estado.paso = 'FINALIZADO';
                    await transferirAAsesor(sock, estado, usuario);
                } else {
                    await sock.sendMessage(usuario, { text: '⚠️ Por favor, selecciona un número válido del menú (1 al 5).' });
                }
                break;

            case 'PEDIR_DETALLE':
                estado.detalle = msg.message.conversation || msg.message.extendedTextMessage?.text || 'Sin detalles adicionales';
                estado.paso = 'FINALIZADO';
                await transferirAAsesor(sock, estado, usuario);
                break;
        }
    });
}

async function transferirAAsesor(sock, estado, usuarioCliente) {
    estado.atendidoPorHumano = true;

    await sock.sendMessage(usuarioCliente, {
        text: `👨‍💻 *¡Excelente, ${estado.nombre}! Solicitud registrada con éxito.*\n\n` +
              'Hemos transferido tus datos a nuestro equipo de asesores en Pro-Tech Maintenance. En pocos minutos uno de nuestros especialistas te atenderá por este medio.\n\n' +
              '_El bot ha finalizado su asistencia para dejarte en manos de nuestro equipo humano._'
    });

    try {
        const numeroLimpio = usuarioCliente.replace('@s.whatsapp.net', '');
        
        const mensajeBaseSugerido = `Oh hola ${estado.nombre} mucho gusto hablas con Juan el gerente de Pro-Tech Maintenance. Yo estaré aquí el día de hoy para ayudarte con tu solicitud sobre ${estado.interes}. ¿En qué te podemos colaborar exactamente?`;

        const resumenParaAsesor = 
            `🚨 *NUEVO CLIENTE EN ESPERA* 🚨\n\n` +
            `👤 *Nombre:* ${estado.nombre}\n` +
            `🏢 *Tipo:* ${estado.tipoCliente}\n` +
            `🎯 *Interés:* ${estado.interes}\n` +
            `💬 *Detalle:* "${estado.detalle}"\n` +
            `📱 *Número:* ${numeroLimpio}\n\n` +
            `📋 *MENSAJE BASE PARA COPIAR Y PEGAR:*\n` +
            `----------------------------------\n` +
            `"${mensajeBaseSugerido}"\n` +
            `----------------------------------\n\n` +
            `🔄 *¿Quieres volver a encender el bot para este cliente cuando termines?*\n` +
            `Solo respóndeme aquí mismo con:\n` +
            `\`activar ${numeroLimpio}\``;

        await sock.sendMessage(NUMERO_ASESOR, { text: resumenParaAsesor });
        console.log(`[ALERTA] Resumen y mensaje base enviado al asesor sobre ${estado.nombre}`);
    } catch (error) {
        console.error('Error al enviar la notificación al asesor:', error);
    }
}

iniciarBot();