package com.mmp.mentoring.controller;

import com.mmp.mentoring.dto.MentoringDtos.PackageInternalView;
import com.mmp.mentoring.dto.MentoringDtos.PaymentSucceededInput;
import com.mmp.mentoring.service.PackageService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Endpoint nội bộ cho payment-service: lấy thông tin gói để thu tiền và báo đã thu tiền. */
@RestController
@RequestMapping("/internal/packages")
public class InternalPackageController {

    private final PackageService packageService;

    public InternalPackageController(PackageService packageService) {
        this.packageService = packageService;
    }

    @GetMapping("/{id}")
    public PackageInternalView pack(@PathVariable UUID id) {
        return packageService.internalView(id);
    }

    @PostMapping("/{id}/payment-succeeded")
    public PackageInternalView paymentSucceeded(@PathVariable UUID id, @Valid @RequestBody PaymentSucceededInput in) {
        return packageService.markPaid(id, in.transactionId());
    }
}
