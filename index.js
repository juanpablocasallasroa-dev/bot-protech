const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');

const NUMERO_ASESOR = '573023394951@s.whatsapp.net';
const sesiones = new Map();

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n==================================================');
            console.log('⚡ ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP ⚡');
            console.log('==================================================\n');
            // Genera el código QR limpio en la consola
            qrcode.toString(qr, { small: true }, (err, string) => {
                console.log(string);
            });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) {
                iniciarBot();
            }
        } else if (connection === 'open') {
            console.log('\n==================================================');
            console.log('✅ ¡Bot Pro-Tech Maintenance conectado en la nube!');
            console.log('==================================================\n');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const usuario = msg.key.remoteJid;
        if (usuario.endsWith('@g.us')) return; // Ignorar grupos

        // Obtener el texto del mensaje de forma segura
        const texto = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            ''
        ).trim().toLowerCase();

        if (!texto) return;

        if (!sesiones.has(usuario)) {
            sesiones.set(usuario, { paso: 'INICIO', tipoCliente: '', interes: '', atendidoPorHumano: false });
        }
        const estado = sesiones.get(usuario);

        // Comando universal para reiniciar
        if (texto === 'menu' || texto === 'menú' || texto === 'inicio') {
            sesiones.set(usuario, { paso: 'MENU_PRINCIPAL', tipoCliente: '', interes: '', atendidoPorHumano: false });
            await sock.sendMessage(usuario, {
                text: '🔄 *Has vuelto al menú principal de Pro-Tech Maintenance.*\n\n' +
                      'Por favor, selecciona qué tipo de cliente eres:\n\n' +
                      '🏢 *1.* Empresa o Institución Educativa\n' +
                      '👤 *2.* Persona Natural / Particular\n\n' +
                      '_Escribe 1 o 2 para continuar._'
            });
            return;
        }

        if (estado.atendidoPorHumano) return;

        switch (estado.paso) {
            case 'INICIO':
            case 'MENU_PRINCIPAL':
                if (texto === '1' || texto === 'empresa') {
                    estado.tipoCliente = 'Empresa / Institución';
                    estado.paso = 'SELECCIONAR_SERVICIO';
                    await sock.sendMessage(usuario, {
                        text: '🏢 *Excelente, enfoque empresarial seleccionado.*\n\n' +
                              '¿Qué tipo de solución tecnológica necesitas para tu organización?\n\n' +
                              '🔌 *1.* Redes de Datos y Cableado Estructurado (LAN/WLAN)\n' +
                              '🖥️ *2.* Instalación de Servidores Locales (DHCP, DNS, Web)\n' +
                              '⚡ *3.* Seguridad Eléctrica, Racks y Puesta a Tierra\n' +
                              '❓ *4.* Otro requerimiento o consulta general\n' +
                              '👨‍💻 *5.* Hablar directamente con un Asesor Humano\n\n' +
                              '_Escribe el número de tu opción._'
                    });
                } else if (texto === '2' || texto === 'particular') {
                    estado.tipoCliente = 'Persona Natural';
                    estado.paso = 'SELECCIONAR_SERVICIO';
                    await sock.sendMessage(usuario, {
                        text: '👤 *Entendido, atención particular seleccionada.*\n\n' +
                              '¿En qué servicio estás interesado el día de hoy?\n\n' +
                              '🔌 *1.* Cableado y puntos de red para hogares/oficinas\n' +
                              '🛠️ *2.* Mantenimiento de equipos de cómputo y soporte\n' +
                              '🌐 *3.* Configuración de redes Wi-Fi y dispositivos\n' +
                              '❓ *4.* Otro requerimiento o consulta general\n' +
                              '👨‍💻 *5.* Hablar directamente con un Asesor Humano\n\n' +
                              '_Escribe el número de tu opción._'
                    });
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

            case 'SELECCIONAR_SERVICIO':
                if (texto === '1' || texto === '2' || texto === '3' || texto === '4') {
                    const opcionesTexto = {
                        '1': 'Redes de Datos / Cableado Estructurado',
                        '2': 'Servidores Locales / Soporte Técnico',
                        '3': 'Seguridad Eléctrica y Racks',
                        '4': 'Consulta General u Otro Servicio'
                    };
                    estado.interes = opcionesTexto[texto];
                    estado.paso = 'FINALIZADO';

                    await sock.sendMessage(usuario, {
                        text: `📝 *¡Hemos registrado tu selección!*\n\n` +
                              `• *Perfil:* ${estado.tipoCliente}\n` +
                              `• *Interés:* ${estado.interes}\n\n` +
                              `¿Deseas transferir este resumen a uno de nuestros asesores humanos para formalizar tu solicitud?\n\n` +
                              `✅ *Sí* (Enviar con asesor)\n` +
                              `❌ *No* (Reiniciar chat)`
                    });
                } else if (texto === '5' || texto === 'asesor') {
                    estado.interes = 'Solicitud directa de Asesor';
                    estado.paso = 'FINALIZADO';
                    await transferirAAsesor(sock, estado, usuario);
                } else {
                    await sock.sendMessage(usuario, { text: '⚠️ Por favor, selecciona un número válido del menú (1 al 5).' });
                }
                break;

            case 'FINALIZADO':
                if (texto === 'si' || texto === 's' || texto === '1' || texto.includes('sí')) {
                    await transferirAAsesor(sock, estado, usuario);
                } else {
                    sesiones.set(usuario, { paso: 'MENU_PRINCIPAL', tipoCliente: '', interes: '', atendidoPorHumano: false });
                    await sock.sendMessage(usuario, { text: '🔄 Chat reiniciado. Escribe cualquier mensaje para comenzar de nuevo.' });
                }
                break;
        }
    });
}

async function transferirAAsesor(sock, estado, usuarioCliente) {
    estado.atendidoPorHumano = true;

    await sock.sendMessage(usuarioCliente, {
        text: '👨‍💻 *¡Solicitud enviada con éxito!*\n\n' +
              'Hemos transferido tus datos y tu requerimiento a nuestro equipo de asesores en Pro-Tech Maintenance. En pocos minutos te contactarán por este medio.\n\n' +
              'El bot se ha pausado. ¡Gracias por confiar en nosotros!'
    });

    try {
        const numeroLimpio = usuarioCliente.replace('@s.whatsapp.net', '');
        const resumenParaAsesor = 
            `🚨 *NUEVO LEAD / CLIENTE EN ESPERA* 🚨\n\n` +
            `📱 *Contacto:* wa.me/${numeroLimpio}\n` +
            `🏢 *Tipo de Cliente:* ${estado.tipoCliente || 'No especificado'}\n` +
            `🎯 *Interés Principal:* ${estado.interes || 'Consulta general'}\n\n` +
            `_El bot se ha pausado para este chat. Ya puedes responderle directamente al cliente desde tu WhatsApp._`;

        await sock.sendMessage(NUMERO_ASESOR, { text: resumenParaAsesor });
        console.log(`[ALERTA] Resumen enviado al asesor sobre el usuario ${usuarioCliente}`);
    } catch (error) {
        console.error('Error al enviar la notificación al asesor:', error);
    }
}

iniciarBot();