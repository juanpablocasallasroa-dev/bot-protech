const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth()
});

// Tu número de asesor configurado para recibir las alertas y resúmenes
const NUMERO_ASESOR = '573023394951@c.us';

// Estados para almacenar las conversaciones en curso y sus selecciones
const sesiones = new Map();

client.on('qr', (qr) => {
    console.log('\n==================================================');
    console.log('⚡ ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP ⚡');
    console.log('==================================================\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('\n==================================================');
    console.log('✅ ¡Bot Pro-Tech Maintenance conectado y operando!');
    console.log('==================================================\n');
});

client.on('message', async (msg) => {
    if (msg.from.includes('@g.us') || msg.from === 'status@broadcast') return;

    const texto = msg.body.trim().toLowerCase();
    const usuario = msg.from;

    // Obtener o inicializar el estado del usuario
    if (!sesiones.has(usuario)) {
        sesiones.set(usuario, { paso: 'INICIO', tipoCliente: '', interes: '', atendidoPorHumano: false });
    }
    const estado = sesiones.get(usuario);

    // Comando universal para reiniciar
    if (texto === 'menu' || texto === 'menú' || texto === 'inicio') {
        sesiones.set(usuario, { paso: 'MENU_PRINCIPAL', tipoCliente: '', interes: '', atendidoPorHumano: false });
        await msg.reply(
            '🔄 *Has vuelto al menú principal de Pro-Tech Maintenance.*\n\n' +
            'Por favor, selecciona qué tipo de cliente eres:\n\n' +
            '🏢 *1.* Empresa o Institución Educativa\n' +
            '👤 *2.* Persona Natural / Particular\n\n' +
            '_Escribe 1 o 2 para continuar._'
        );
        return;
    }

    // Si ya fue pasado con un humano, el bot se calla
    if (estado.atendidoPorHumano) return;

    // Flujo interactivo paso a paso
    switch (estado.paso) {
        case 'INICIO':
        case 'MENU_PRINCIPAL':
            if (texto === '1' || texto === 'empresa') {
                estado.tipoCliente = 'Empresa / Institución';
                estado.paso = 'SELECCIONAR_SERVICIO';
                await msg.reply(
                    '🏢 *Excelente, enfoque empresarial seleccionado.*\n\n' +
                    '¿Qué tipo de solución tecnológica necesitas para tu organización?\n\n' +
                    '🔌 *1.* Redes de Datos y Cableado Estructurado (LAN/WLAN)\n' +
                    '🖥️ *2.* Instalación de Servidores Locales (DHCP, DNS, Web)\n' +
                    '⚡ *3.* Seguridad Eléctrica, Racks y Puesta a Tierra\n' +
                    '❓ *4.* Otro requerimiento o consulta general\n' +
                    '👨‍💻 *5.* Hablar directamente con un Asesor Humano\n\n' +
                    '_Escribe el número de tu opción._'
                );
            } else if (texto === '2' || texto === 'particular') {
                estado.tipoCliente = 'Persona Natural';
                estado.paso = 'SELECCIONAR_SERVICIO';
                await msg.reply(
                    '👤 *Entendido, atención particular seleccionada.*\n\n' +
                    '¿En qué servicio estás interesado el día de hoy?\n\n' +
                    '🔌 *1.* Cableado y puntos de red para hogares/oficinas\n' +
                    '🛠️ *2.* Mantenimiento de equipos de cómputo y soporte\n' +
                    '🌐 *3.* Configuración de redes Wi-Fi y dispositivos\n' +
                    '❓ *4.* Otro requerimiento o consulta general\n' +
                    '👨‍💻 *5.* Hablar directamente con un Asesor Humano\n\n' +
                    '_Escribe el número de tu opción._'
                );
            } else {
                await msg.reply(
                    '👋 *¡Hola! Hablas con Eva, la asistente virtual de Pro-Tech Maintenance.*\n\n' +
                    'Para brindarte una mejor atención, dime:\n' +
                    '¿Para quién es el servicio?\n\n' +
                    '🏢 *1.* Empresa o Institución Educativa\n' +
                    '👤 *2.* Persona Natural / Particular\n\n' +
                    '_Escribe 1 o 2 para comenzar._'
                );
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

                await msg.reply(
                    `📝 *¡Hemos registrado tu selección!*\n\n` +
                    `• *Perfil:* ${estado.tipoCliente}\n` +
                    `• *Interés:* ${estado.interes}\n\n` +
                    `¿Deseas transferir este resumen a uno de nuestros asesores humanos para formalizar tu solicitud?\n\n` +
                    `✅ *Sí* (Enviar con asesor)\n` +
                    `❌ *No* (Reiniciar chat)`
                );
            } else if (texto === '5' || texto === 'asesor') {
                estado.interes = 'Solicitud directa de Asesor';
                estado.paso = 'FINALIZADO';
                await transferirAAsesor(msg, estado, usuario);
            } else {
                await msg.reply('⚠️ Por favor, selecciona un número válido del menú (1 al 5).');
            }
            break;

        case 'FINALIZADO':
            if (texto === 'si' || texto === 's' || texto === '1' || texto.includes('sí')) {
                await transferirAAsesor(msg, estado, usuario);
            } else {
                sesiones.set(usuario, { paso: 'MENU_PRINCIPAL', tipoCliente: '', interes: '', atendidoPorHumano: false });
                await msg.reply('🔄 Chat reiniciado. Escribe cualquier mensaje para comenzar de nuevo.');
            }
            break;
    }
});

// Función para notificar y enviar resumen al asesor real
async function transferirAAsesor(msg, estado, usuarioCliente) {
    estado.atendidoPorHumano = true;

    // 1. Mensaje al cliente
    await msg.reply(
        '👨‍💻 *¡Solicitud enviada con éxito!*\n\n' +
        'Hemos transferido tus datos y tu requerimiento a nuestro equipo de asesores en Pro-Tech Maintenance. En pocos minutos te contactarán por este medio.\n\n' +
        'El bot se ha pausado. ¡Gracias por confiar en nosotros!'
    );

    // 2. Enviar notificación y resumen detallado al número del asesor real
    try {
        const resumenParaAsesor = 
            `🚨 *NUEVO LEAD / CLIENTE EN ESPERA* 🚨\n\n` +
            `📱 *Contacto:* wa.me/${usuarioCliente.replace('@c.us', '')}\n` +
            `🏢 *Tipo de Cliente:* ${estado.tipoCliente || 'No especificado'}\n` +
            `🎯 *Interés Principal:* ${estado.interes || 'Consulta general'}\n\n` +
            `_El bot se ha pausado para este chat. Ya puedes responderle directamente al cliente desde tu WhatsApp._`;

        await client.sendMessage(NUMERO_ASESOR, resumenParaAsesor);
        console.log(`[ALERTA] Resumen enviado al asesor real (${NUMERO_ASESOR}) sobre el usuario ${usuarioCliente}`);
    } catch (error) {
        console.error('Error al enviar la notificación al asesor:', error);
    }
}

client.initialize();