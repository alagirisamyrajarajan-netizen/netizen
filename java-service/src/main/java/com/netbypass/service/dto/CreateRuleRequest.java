package com.netbypass.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * DTO for creating a new proxy rule.
 * Used in the request body of {@code POST /api/rules}.
 */
@Data
public class CreateRuleRequest {

    /**
     * URL pattern to match (e.g., "*.google.com", "ads.doubleclick.net").
     */
    @NotBlank(message = "Pattern must not be blank")
    private String pattern;

    /**
     * Action to take when pattern matches.
     * Must be exactly "allow" or "block".
     */
    @NotBlank(message = "Action must not be blank")
    @Pattern(regexp = "^(allow|block)$", message = "Action must be 'allow' or 'block'")
    private String action;

    /**
     * Human-readable description of what this rule does.
     */
    private String description;
}
