package com.unimark.api;

import java.util.Properties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;

@Service
public class EmailCodeSender {
    private final JavaMailSenderImpl mail = new JavaMailSenderImpl();
    private final String from;
    private final boolean configured;

    public EmailCodeSender(
            @Value("${unimark.mail.host:}") String host,
            @Value("${unimark.mail.port:587}") int port,
            @Value("${unimark.mail.username:}") String username,
            @Value("${unimark.mail.password:}") String password,
            @Value("${unimark.mail.from:}") String from,
            @Value("${unimark.mail.security:starttls}") String security) {
        this.from = from;
        configured = !host.isBlank() && !from.isBlank();
        if (!configured) return;
        mail.setHost(host);
        mail.setPort(port);
        mail.setUsername(username);
        mail.setPassword(password);
        Properties properties = mail.getJavaMailProperties();
        properties.put("mail.smtp.auth", Boolean.toString(!username.isBlank()));
        properties.put("mail.smtp.connectiontimeout", "5000");
        properties.put("mail.smtp.timeout", "5000");
        properties.put("mail.smtp.writetimeout", "5000");
        if ("starttls".equalsIgnoreCase(security)) {
            properties.put("mail.smtp.starttls.enable", "true");
            properties.put("mail.smtp.starttls.required", "true");
        } else if ("ssl".equalsIgnoreCase(security)) {
            properties.put("mail.smtp.ssl.enable", "true");
        } else if (!"none".equalsIgnoreCase(security)) {
            throw new IllegalArgumentException("UNIMARK_SMTP_SECURITY must be starttls, ssl, or none.");
        }
    }

    public void requireConfigured() {
        if (!configured) throw ApiException.serviceUnavailable("Email sign-in is not configured on this server. Set the SMTP settings and try again.");
    }

    public void send(String email, String code) {
        requireConfigured();
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Your UniMark verification code");
        message.setText("Your UniMark code is " + code + ".\n\nIt expires in 10 minutes. If you did not request it, you can ignore this email.");
        try {
            mail.send(message);
        } catch (MailException exception) {
            throw ApiException.serviceUnavailable("UniMark could not send your code. Please try again shortly.");
        }
    }
}
