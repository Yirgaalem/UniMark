package com.unimark.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class EmailCodeSenderTest {
    @Test
    void refusesToStartAnEmailCodeFlowWithoutSmtpConfiguration() {
        EmailCodeSender sender = new EmailCodeSender("", 587, "", "", "", "starttls");

        ApiException error = assertThrows(ApiException.class, sender::requireConfigured);

        assertEquals(503, error.status().value());
    }
}
